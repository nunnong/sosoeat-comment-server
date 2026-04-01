const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

/**
 * @swagger
 * /meetings:
 *   post:
 *     summary: 모임 생성 (DB 동기화)
 *     tags: [Meetings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *               - hostId
 *               - teamId
 *             properties:
 *               id:
 *                 type: integer
 *               hostId:
 *                 type: integer
 *               teamId:
 *                 type: string
 *     responses:
 *       201:
 *         description: 모임 생성 성공
 *       500:
 *         description: 서버 오류
 */
router.post('/', async (req, res) => {
  const { id, hostId, teamId } = req.body;

  try {
    const meeting = await prisma.meeting.upsert({
      where: { id: Number(id) },
      update: {},
      create: {
        id: Number(id),
        hostId: Number(hostId),
        teamId: teamId,
      },
    });
    res.status(201).json(meeting);
  } catch (e) {
    console.error('모임 생성 에러:', e);
    res.status(500).json({ message: '서버 오류' });
  }
});

/**
 * @swagger
 * /meetings/{meetingId}:
 *   delete:
 *     summary: 모임 삭제 (DB 동기화)
 *     tags: [Meetings]
 *     parameters:
 *       - in: path
 *         name: meetingId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 삭제 성공
 *       500:
 *         description: 서버 오류
 */
router.delete('/:meetingId', async (req, res) => {
  const { meetingId } = req.params;

  try {
    await prisma.meeting.delete({
      where: { id: Number(meetingId) },
    });
    res.status(200).json({ message: '삭제 완료' });
  } catch (e) {
    console.error('모임 삭제 에러:', e);
    res.status(500).json({ message: '서버 오류' });
  }
});

/**
 * @swagger
 * /meetings/{meetingId}/comments/count:
 *   get:
 *     summary: 모임의 댓글 수 조회
 *     tags: [Comments]
 *     parameters:
 *       - in: path
 *         name: meetingId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 댓글 수 조회 성공
 *       500:
 *         description: 서버 오류
 */
router.get('/:meetingId/comments/count', async (req, res) => {
  const { meetingId } = req.params;

  try {
    const count = await prisma.comment.count({
      where: {
        meetingId: Number(meetingId),
        isDeleted: false,
      },
    });
    res.status(200).json({ count });
  } catch (e) {
    console.error('댓글 수 조회 에러:', e);
    res.status(500).json({ message: '서버 오류' });
  }
});

/**
 * @swagger
 * /meetings/{meetingId}/comments:
 *   get:
 *     summary: 모임의 댓글 전체 조회
 *     tags: [Comments]
 *     parameters:
 *       - in: path
 *         name: meetingId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: header
 *         name: Authorization
 *         required: false
 *         schema:
 *           type: string
 *         description: Bearer 토큰 (있으면 isLiked/isHost 포함, 없으면 false)
 *     responses:
 *       200:
 *         description: 댓글 목록 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   content:
 *                     type: string
 *                   isDeleted:
 *                     type: boolean
 *                   likeCount:
 *                     type: integer
 *                   isLiked:
 *                     type: boolean
 *                   isHost:
 *                     type: boolean
 *                   user:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       nickname:
 *                         type: string
 *                       profileUrl:
 *                         type: string
 *                   replies:
 *                     type: array
 *       500:
 *         description: 서버 오류
 */
router.get('/:meetingId/comments', async (req, res) => {
  const { meetingId } = req.params;

  let currentUserId = null;
  const token = req.headers.authorization;
  if (token) {
    try {
      const response = await fetch(
        `${process.env.MAIN_API_URL}/teams/${process.env.TEAM_ID}/users/me`,
        { headers: { Authorization: token } }
      );
      if (response.ok) {
        const user = await response.json();
        currentUserId = user.id;
      }
    } catch (e) {
      // 토큰 검증 실패해도 댓글 조회는 계속 진행
    }
  }

  try {
    const [meeting, comments] = await Promise.all([
      prisma.meeting.findUnique({
        where: { id: Number(meetingId) },
      }),
      prisma.comment.findMany({
        where: {
          meetingId: Number(meetingId),
          parentId: null,
        },
        include: {
          user: {
            select: { id: true, nickname: true, profileUrl: true },
          },
          replies: {
            where: { isDeleted: false },
            include: {
              user: {
                select: { id: true, nickname: true, profileUrl: true },
              },
              _count: { select: { likes: true } },
              likes: currentUserId
                ? { where: { userId: currentUserId }, select: { userId: true } }
                : false,
            },
          },
          _count: { select: { likes: true } },
          likes: currentUserId
            ? { where: { userId: currentUserId }, select: { userId: true } }
            : false,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const result = comments.map((comment) => ({
      ...comment,
      likeCount: comment._count.likes,
      isLiked: currentUserId ? comment.likes.length > 0 : false,
      isHost: meeting ? comment.userId === meeting.hostId : false,
      likes: undefined,
      _count: undefined,
      replies: comment.replies.map((reply) => ({
        ...reply,
        likeCount: reply._count.likes,
        isLiked: currentUserId ? reply.likes.length > 0 : false,
        isHost: meeting ? reply.userId === meeting.hostId : false,
        likes: undefined,
        _count: undefined,
      })),
    }));

    res.status(200).json(result);
  } catch (e) {
    console.error('댓글 조회 에러:', e);
    res.status(500).json({ message: '서버 오류' });
  }
});

/**
 * @swagger
 * /meetings/{meetingId}/comments:
 *   post:
 *     summary: 댓글/대댓글 작성
 *     tags: [Comments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: meetingId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *               parentId:
 *                 type: integer
 *                 nullable: true
 *                 description: 대댓글인 경우 부모 댓글 ID
 *     responses:
 *       201:
 *         description: 댓글 작성 성공
 *       401:
 *         description: 인증 실패
 *       500:
 *         description: 서버 오류
 */
router.post('/:meetingId/comments', require('../middlewares/verifyMember'), require('../middlewares/ensureMeeting'), async (req, res) => {
  const { meetingId } = req.params;
  const { content, parentId } = req.body;

  try {
    const comment = await prisma.comment.create({
      data: {
        meetingId: Number(meetingId),
        userId: req.user.id,
        content,
        parentId: parentId ? Number(parentId) : null,
      },
    });
    res.status(201).json(comment);
  } catch (e) {
    console.error('댓글 작성 에러:', e);
    res.status(500).json({ message: '서버 오류' });
  }
});

module.exports = router;