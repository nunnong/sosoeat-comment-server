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
  const meetingIdNum = Number(meetingId);

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
      } else {
        const errBody = await response.text();
        console.log('users/me 에러 body:', errBody);
      }
    } catch (e) {
      console.error('users/me fetch 실패:', e);
    }
  }

  try {
    // 댓글 + 작성자 + 모임 주최자 + 좋아요 수 + 내 좋아요 여부를 단일 쿼리로 조회 (N+1 방지)
    const rows = await prisma.$queryRaw`
      SELECT
        c.id,
        c."parentId",
        c.content,
        c."isDeleted",
        c."createdAt",
        c."userId",
        u.nickname AS "userNickname",
        u."profileUrl" AS "userProfileUrl",
        m."hostId" AS "meetingHostId",
        COALESCE(lc.count, 0)::int AS "likeCount",
        (ul."userId" IS NOT NULL) AS "isLiked"
      FROM "Comment" c
      JOIN "User" u ON u.id = c."userId"
      JOIN "Meeting" m ON m.id = c."meetingId"
      LEFT JOIN (
        SELECT "commentId", COUNT(*)::int AS count
        FROM "CommentLike"
        GROUP BY "commentId"
      ) lc ON lc."commentId" = c.id
      LEFT JOIN "CommentLike" ul ON ul."commentId" = c.id AND ul."userId" = ${currentUserId}
      WHERE c."meetingId" = ${meetingIdNum}
        AND (c."parentId" IS NULL OR c."isDeleted" = false)
      ORDER BY c."createdAt" ASC
    `;

    const toDto = (row) => ({
      id: row.id,
      parentId: row.parentId,
      content: row.content,
      isDeleted: row.isDeleted,
      createdAt: row.createdAt,
      author: {
        nickname: row.userNickname,
        profileUrl: row.userProfileUrl,
      },
      likeCount: row.likeCount,
      isLiked: currentUserId ? row.isLiked : false,
      isHostComment: row.userId === row.meetingHostId,
      isMine: currentUserId ? row.userId === currentUserId : false,
      replies: [],
    });

    const dtoById = new Map();
    const topLevel = [];
    for (const row of rows) {
      const dto = toDto(row);
      dtoById.set(row.id, dto);
      if (row.parentId === null) topLevel.push(dto);
    }
    // 대댓글까지만 지원 (2depth) — 대댓글의 대댓글은 최상위 댓글에만 연결
    for (const row of rows) {
      if (row.parentId === null) continue;
      const parentRow = dtoById.get(row.parentId);
      if (parentRow && parentRow.parentId === null) {
        parentRow.replies.push(dtoById.get(row.id));
      }
    }

    res.status(200).json(topLevel);
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