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
})