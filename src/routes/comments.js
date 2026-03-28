const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const verifyMember = require('../middlewares/verifyMember');

// 댓글 수정
router.patch('/:commentId', verifyMember, async (req, res) => {
  const { commentId } = req.params;
  const { content } = req.body;

  try {
    const comment = await prisma.comment.findUnique({
      where: { id: Number(commentId) },
    });

    if (!comment) {
      return res.status(404).json({ message: '댓글을 찾을 수 없습니다.' });
    }

    if (comment.userId !== req.user.id) {
      return res.status(403).json({ message: '본인 댓글만 수정할 수 있습니다.' });
    }

    const updated = await prisma.comment.update({
      where: { id: Number(commentId) },
      data: { content },
    });
    res.status(200).json(updated);
  } catch (e) {
    console.error('댓글 수정 에러:', e);
    res.status(500).json({ message: '서버 오류' });
  }
});

// 댓글 삭제 (소프트 삭제)
router.delete('/:commentId', verifyMember, async (req, res) => {
  const { commentId } = req.params;

  try {
    const comment = await prisma.comment.findUnique({
      where: { id: Number(commentId) },
    });

    if (!comment) {
      return res.status(404).json({ message: '댓글을 찾을 수 없습니다.' });
    }

    if (comment.userId !== req.user.id) {
      return res.status(403).json({ message: '본인 댓글만 삭제할 수 있습니다.' });
    }

    await prisma.comment.update({
      where: { id: Number(commentId) },
      data: { isDeleted: true },
    });
    res.status(200).json({ message: '삭제 완료' });
  } catch (e) {
    console.error('댓글 삭제 에러:', e);
    res.status(500).json({ message: '서버 오류' });
  }
});

module.exports = router;