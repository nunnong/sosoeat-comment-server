const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const verifyMember = require('../middlewares/verifyMember');

/**
 * @swagger
 * /comments/{commentId}:
 *   patch:
 *     summary: 댓글 수정 (본인만)
 *     tags: [Comments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
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
 *     responses:
 *       200:
 *         description: 댓글 수정 성공
 *       401:
 *         description: 인증 실패
 *       403:
 *         description: 본인 댓글 아님
 *       404:
 *         description: 댓글 없음
 *       500:
 *         description: 서버 오류
 */
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

/**
 * @swagger
 * /comments/{commentId}:
 *   delete:
 *     summary: 댓글 삭제 (본인만, 소프트 삭제)
 *     tags: [Comments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 댓글 삭제 성공
 *       401:
 *         description: 인증 실패
 *       403:
 *         description: 본인 댓글 아님
 *       404:
 *         description: 댓글 없음
 *       500:
 *         description: 서버 오류
 */
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