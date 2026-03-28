const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

// 모임 생성 (기존 백엔드 동기화용)
router.post('/', async (req, res) => {
  const { id, hostId, teamId } = req.body;

  try {
    const meeting = await prisma.meeting.upsert({
      where: { id: Number(id) },
      update: {},
      create: {
        id: Number(id),
        hostId: Number(hostId),
        teamId: Number(teamId),
      },
    });
    res.status(201).json(meeting);
  } catch (e) {
    console.error('모임 생성 에러:', e);
    res.status(500).json({ message: '서버 오류' });
  }
});

// 모임 삭제 (기존 백엔드 동기화용)
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

// 댓글 목록 조회
router.get('/:meetingId/comments', async (req, res) => {
  const { meetingId } = req.params;

  try {
    const comments = await prisma.comment.findMany({
      where: {
        meetingId: Number(meetingId),
        parentId: null, // 최상위 댓글만
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
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.status(200).json(comments);
  } catch (e) {
    console.error('댓글 조회 에러:', e);
    res.status(500).json({ message: '서버 오류' });
  }
});

// 댓글 작성
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