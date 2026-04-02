const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

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

router.get('/:meetingId/comments', async (req, res) => {
  const { meetingId } = req.params;
  console.log('meetingId 파라미터:', meetingId, '→ Number:', Number(meetingId));

  let currentUserId = null;
  const token = req.headers.authorization;
  if (token) {
    try {
      const response = await fetch(
        `${process.env.MAIN_API_URL}/${process.env.TEAM_ID}/users/me`,
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
              // 로그인한 경우에만 likes 포함
              ...(currentUserId && {
                likes: { where: { userId: currentUserId }, select: { userId: true } },
              }),
            },
          },
          _count: { select: { likes: true } },
          // 로그인한 경우에만 likes 포함
          ...(currentUserId && {
            likes: { where: { userId: currentUserId }, select: { userId: true } },
          }),
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const result = comments.map((comment) => ({
      id: comment.id,
      parentId: comment.parentId,
      content: comment.content,
      isDeleted: comment.isDeleted,
      createdAt: comment.createdAt,
      author: {
        nickname: comment.user.nickname,
        profileUrl: comment.user.profileUrl,
      },
      likeCount: comment._count.likes,
      isLiked: currentUserId ? (comment.likes?.length ?? 0) > 0 : false,
      isHostComment: meeting ? comment.userId === meeting.hostId : false,
      isMine: currentUserId ? comment.userId === currentUserId : false,
      replies: comment.replies.map((reply) => ({
        id: reply.id,
        parentId: reply.parentId,
        content: reply.content,
        isDeleted: reply.isDeleted,
        createdAt: reply.createdAt,
        author: {
          nickname: reply.user.nickname,
          profileUrl: reply.user.profileUrl,
        },
        likeCount: reply._count.likes,
        isLiked: currentUserId ? (reply.likes?.length ?? 0) > 0 : false,
        isHostComment: meeting ? reply.userId === meeting.hostId : false,
        isMine: currentUserId ? reply.userId === currentUserId : false,
        replies: [],
      })),
    }));

    res.status(200).json(result);
  } catch (e) {
    console.error('댓글 조회 에러:', e);
    res.status(500).json({ message: '서버 오류' });
  }
});

router.post(
  '/:meetingId/comments',
  require('../middlewares/verifyMember'),
  require('../middlewares/ensureMeeting'),
  async (req, res) => {
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
  }
);

module.exports = router;
