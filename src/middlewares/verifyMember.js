require('dotenv').config();

const verifyMember = async (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({ message: '로그인이 필요합니다.' });
  }

  try {
    const response = await fetch(
      `${process.env.MAIN_API_URL}/teams/${process.env.TEAM_ID}/users/me`,
      {
        headers: { Authorization: token },
      }
    );

    if (!response.ok) {
      return res.status(401).json({ message: '인증에 실패했습니다.' });
    }

    const user = await response.json();
    req.user = user;
    next();
  } catch (e) {
    console.error('verifyMember 에러:', e);
    res.status(500).json({ message: '서버 오류' });
  }
};

module.exports = verifyMember;