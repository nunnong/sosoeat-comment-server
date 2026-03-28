const prisma = require('../lib/prisma');

const ensureMeeting = async (req, res, next) => {
  const { meetingId } = req.params;

  try {
    await prisma.meeting.upsert({
      where: { id: Number(meetingId) },
      update: {},
      create: {
        id: Number(meetingId),
        teamId: req.user.teamId,
        hostId: req.user.id,
      },
    });
    next();
  } catch (e) {
    console.error('ensureMeeting 에러:', e);
    res.status(500).json({ message: '서버 오류' });
  }
};

module.exports = ensureMeeting;