# sosoeat-comment-server

소소잇 댓글 서버 - Express + Prisma + Supabase

---

## 사용 목적

모임 상세 페이지 하단 댓글 섹션에 사용됩니다.
기존 백엔드 API에 댓글 기능이 포함되어 있지 않아 Express 서버를 별도로 구성하였으며,
기존 백엔드와 새 댓글 서버, 총 두 개의 서버를 함께 사용합니다.

---

## 기술 스택

- **Runtime**: Node.js
- **Framework**: Express
- **ORM**: Prisma 5
- **Database**: Supabase (PostgreSQL)
- **배포**: Railway

---

## 제공 API

### 인증 불필요

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | /meetings | 모임 생성 시 DB에 동기화 |
| DELETE | /meetings/:meetingId | 모임 삭제 시 DB에서 제거 (댓글 cascade 삭제) |
| GET | /meetings/:meetingId/comments | 모임의 댓글 전체 조회 |
| GET | /meetings/:meetingId/comments/count | 모임의 댓글 수 조회 |

### 인증 필요

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | /meetings/:meetingId/comments | 댓글/대댓글 작성 |
| PATCH | /comments/:commentId | 댓글 수정 (본인만) |
| DELETE | /comments/:commentId | 댓글 삭제 (본인만, 소프트 삭제) |
| POST | /comments/:commentId/likes | 댓글 좋아요 (미구현) |
| DELETE | /comments/:commentId/likes | 댓글 좋아요 취소 (미구현) |

---

## 데이터 흐름

### 1. 모임 생성/삭제

기존 백엔드 호출이 우선입니다. 새 서버는 댓글 기능을 위한 동기화 용도로만 사용합니다.
기존 백엔드 성공 후 새 서버에 동기화하며, 동기화 실패 시에도 모임 생성/삭제 자체는 성공으로 처리합니다.

### 2. 댓글 작성

1. `verifyMember` 미들웨어 → 기존 백엔드 `GET /{teamId}/users/me` 호출로 토큰 유효성 검증
2. `ensureMeeting` 미들웨어 → Meeting upsert (동기화 누락 보완)
3. User upsert (없으면 insert, 있으면 skip)
4. Comment insert

---

## 인증 방식

프론트엔드는 BFF(Backend-for-Frontend) 패턴을 사용합니다.
`accessToken`은 httpOnly 쿠키에만 존재하며 클라이언트 JS에서 접근이 불가능합니다.

댓글 서버로의 인증이 필요한 요청은 반드시 **Next.js Route Handler를 경유**해야 합니다.
Route Handler에서 `CookieStorage`를 통해 쿠키의 `accessToken`을 읽어 `Authorization` 헤더에 담아 댓글 서버로 전달합니다.

```
브라우저
  → Next.js Route Handler (CookieStorage로 accessToken 읽어 Authorization 헤더 삽입)
  → 댓글 서버 (verifyMember 미들웨어에서 토큰 검증)
```

---

## 동기화 실패 보완 전략

댓글 작성 시점에 `ensureMeeting` 미들웨어가 Meeting upsert를 수행합니다.
모임 생성 시 동기화가 실패했더라도 첫 댓글 작성 시 자동으로 복구됩니다.

---

## 환경 변수
```env
DATABASE_URL=        # Supabase Pooler 연결 문자열 (포트 6543)
DIRECT_URL=          # Supabase Direct 연결 문자열 (포트 5432)
MAIN_API_URL=        # 기존 백엔드 API URL
TEAM_ID=             # 팀 ID
NEXT_APP_URL=        # Next.js 서버 URL (CORS 허용 대상)
```

### 환경별 NEXT_APP_URL 설정

| 환경 | 값 |
|---|---|
| 로컬 개발 (`.env`) | `http://localhost:3000` |
| Railway 배포 | `https://sosoeat.vercel.app` |

> `.env` 파일은 절대 Git에 커밋하지 않습니다.

---

## 프론트엔드 사용 가이드

### 환경 변수 설정

```env
# Railway 배포 후 발급된 URL로 고정 (서버 전용, NEXT_PUBLIC 사용 금지)
COMMENT_API_URL=https://sosoeat-comment.up.railway.app
```

### 인증이 필요 없는 API (댓글 조회)

서버 컴포넌트에서 직접 호출 가능합니다.

```ts
const res = await fetch(
  `${process.env.COMMENT_API_URL}/meetings/${meetingId}/comments`
);
const comments = await res.json();
```

### 인증이 필요한 API (댓글 작성/수정/삭제)

Route Handler를 통해 `CookieStorage`로 토큰을 읽어 댓글 서버로 전달합니다.

```ts
// app/api/comments/[meetingId]/route.ts
import { CookieStorage } from '@/lib/auth/cookie-storage';

export async function POST(
  req: Request,
  { params }: { params: { meetingId: string } }
) {
  const accessToken = CookieStorage.getAccessToken();
  const body = await req.json();

  const res = await fetch(
    `${process.env.COMMENT_API_URL}/meetings/${params.meetingId}/comments`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    }
  );

  const data = await res.json();
  return Response.json(data, { status: res.status });
}
```

```ts
// 클라이언트에서 호출
const postComment = async (meetingId: number, content: string, parentId?: number) => {
  const res = await fetch(`/api/comments/${meetingId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, parentId }),
  });
  return res.json();
};
```

### 모임 생성/삭제 시 동기화

기존 백엔드 호출 성공 후 댓글 서버에 동기화합니다.
동기화 실패 시에도 모임 생성/삭제 자체는 성공으로 처리합니다.

```ts
// 모임 생성
const createMeeting = async (formData) => {
  // 1. 기존 백엔드 먼저
  const meeting = await apiServer.post('/meetings', formData);

  // 2. 댓글 서버 동기화 (실패해도 무시)
  try {
    await fetch(`${process.env.COMMENT_API_URL}/meetings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: meeting.id,
        hostId: meeting.hostId,
        teamId: meeting.teamId,
      }),
    });
  } catch (e) {
    console.error('댓글 서버 동기화 실패:', e);
  }

  return meeting;
};

// 모임 삭제
const deleteMeeting = async (meetingId: number) => {
  // 1. 기존 백엔드 먼저
  await apiServer.delete(`/meetings/${meetingId}`);

  // 2. 댓글 서버 동기화 (실패해도 무시)
  try {
    await fetch(`${process.env.COMMENT_API_URL}/meetings/${meetingId}`, {
      method: 'DELETE',
    });
  } catch (e) {
    console.error('댓글 서버 동기화 실패:', e);
  }
};
```

### 회원/비회원 판단 (1차 방어)

댓글 작성 UI는 Zustand `authStore`의 유저 정보 존재 여부로 판단합니다.
토큰은 httpOnly 쿠키에 있어 클라이언트에서 직접 읽을 수 없으므로, 유저 정보를 기준으로 로그인 상태를 확인합니다.

```ts
const { user } = useAuthStore();

// user 있으면 댓글 활성화, 없으면 비활성화
```

실제 토큰 유효성 검증(만료 토큰, 탈퇴 유저 등)은 댓글 서버의 `verifyMember` 미들웨어에서 2차로 처리합니다.