# sosoeat-comment-server

소소잇 댓글 서버 — Express + Prisma + Supabase

---

## 개요

모임 상세 페이지 하단 댓글 섹션을 위한 별도 서버입니다.  
기존 백엔드 API에 댓글 기능이 포함되어 있지 않아 Express 서버를 독립적으로 구성하였습니다.

---

## 기술 스택

| 항목 | 기술 |
|---|---|
| Runtime | Node.js |
| Framework | Express |
| ORM | Prisma 5 |
| Database | Supabase (PostgreSQL) |
| 배포 | Railway |

---

## 별도 서버를 구성한 이유

### 배경

댓글은 로그인한 사용자만 작성할 수 있어야 했습니다. 토큰 검증을 위해 메인 백엔드의 Secret Key가 필요했지만, 해당 키는 백엔드 서버에만 존재했고 프론트엔드 레포에서는 접근이 불가능했습니다. 허용된 수단은 메인 백엔드 API 호출뿐이었기 때문에, 메인 백엔드에 검증을 위임하는 프록시 구조가 필요했습니다.

### 방식 검토

**1안 — Supabase Auth 단독**

Supabase RLS로 인증을 처리하는 방식입니다. 이론적으로는 Spring Boot의 JWT Secret을 Supabase에 등록하면 서명 검증이 가능하지만, 실제 JWT 페이로드를 확인했을 때 구조적인 문제가 있었습니다.

```json
{
  "sub": 1398,
  "teamId": "sosoeattest",
  "email": "test@example.com"
}
```

| 문제 | 설명 |
|---|---|
| `sub`가 숫자 ID | Supabase는 UUID 형식을 기대하므로 `auth.uid()`가 `null` 반환 → 소유권 검증 불가 |
| `role` 필드 없음 | Supabase는 `"authenticated"` 값을 요구하므로 RLS 자체가 동작하지 않음 |

`sub`를 UUID로 맞추려면 Spring Boot DB 스키마 변경, 기존 토큰 전부 무효화, 전체 인증 로직 수정이 필요합니다. 댓글 서버 하나를 위해 메인 백엔드 전체를 건드리는 것은 영향 범위가 너무 컸습니다.

→ **탈락**: 어떤 방법을 써도 JWT를 직접 검증하는 로직이 별도로 필요했습니다.

---

**2안 — Next.js Route Handler + Supabase DB**

프론트 프로젝트 내 `/app/api/`에 Route Handler로 댓글 API를 구성하는 방식입니다. 기술적으로는 가능하지만 아래 이유로 탈락했습니다.

| 문제 | 설명 |
|---|---|
| 서버리스 환경 | Vercel 서버리스는 요청마다 함수가 새로 실행되어 Prisma 사용 시 요청마다 DB 커넥션을 새로 맺음 → 트래픽이 몰릴 경우 커넥션 풀 고갈 위험 |
| 배포 의존성 | Vercel 배포를 직접 관리하지 않아 테스트할 때마다 타 팀원에게 의존해야 함 |
| 코드 혼재 | 팀원 5명이 같은 레포에서 작업하므로 PR 관리가 복잡해짐 |
| 로그 혼재 | 프론트 로그와 API 로그가 섞여 디버깅이 어려움 |

→ **탈락**: 서버리스 환경의 DB 커넥션 문제와 팀 협업 구조에 맞지 않았습니다.

---

**3안 — Railway Express 별도 서버 ✅ 채택**

| 이유 | 설명 |
|---|---|
| 안정적인 DB 커넥션 | 항상 떠있는 서버이므로 Prisma DB 커넥션을 안정적으로 유지 |
| 배포 독립성 | Railway에 직접 배포하고 즉시 테스트 가능 |
| 코드 분리 | 프론트 레포와 완전히 분리되어 팀 협업 영향 없음 |
| 로그 분리 | Railway 대시보드에서 댓글 서버 로그만 독립적으로 확인 가능 |
| JWT 직접 검증 | `verifyMember` 미들웨어로 Spring Boot 토큰을 직접 검증 |

---

## 인증 방식

프론트엔드는 BFF(Backend-for-Frontend) 패턴을 사용합니다.  
`accessToken`은 httpOnly 쿠키에만 존재하며 클라이언트 JS에서 접근이 불가능합니다.

인증이 필요한 요청은 반드시 **Next.js Route Handler를 경유**해야 합니다.  
Route Handler에서 `CookieStorage`를 통해 쿠키의 `accessToken`을 읽어 `Authorization` 헤더에 담아 댓글 서버로 전달합니다.

```
브라우저
  → Next.js Route Handler (CookieStorage로 accessToken 읽어 Authorization 헤더 삽입)
  → 댓글 서버 (verifyMember 미들웨어에서 토큰 검증)
  → 메인 백엔드 API (GET /{teamId}/users/me 호출로 토큰 유효성 확인)
  → Supabase DB
```

---

## 제공 API

### 인증 불필요

| Method | Endpoint | 설명 |
|---|---|---|
| POST | /meetings | 모임 생성 시 DB에 동기화 |
| DELETE | /meetings/:meetingId | 모임 삭제 시 DB에서 제거 (댓글 cascade 삭제) |
| GET | /meetings/:meetingId/comments | 모임의 댓글 전체 조회 |
| GET | /meetings/:meetingId/comments/count | 모임의 댓글 수 조회 |

### 인증 필요

| Method | Endpoint | 설명 |
|---|---|---|
| POST | /meetings/:meetingId/comments | 댓글/대댓글 작성 |
| PATCH | /comments/:commentId | 댓글 수정 (본인만) |
| DELETE | /comments/:commentId | 댓글 삭제 (본인만, 소프트 삭제) |
| POST | /comments/:commentId/likes | 댓글 좋아요 |
| DELETE | /comments/:commentId/likes | 댓글 좋아요 취소 |

---

## 데이터 흐름

### 모임 생성/삭제 동기화

기존 백엔드 호출이 우선입니다. 기존 백엔드 성공 후 댓글 서버에 동기화하며, 동기화 실패 시에도 모임 생성/삭제 자체는 성공으로 처리합니다.

### 댓글 작성

1. `verifyMember` 미들웨어 → 메인 백엔드 `GET /{teamId}/users/me` 호출로 토큰 유효성 검증
2. `ensureMeeting` 미들웨어 → Meeting upsert (동기화 누락 보완)
3. User upsert (없으면 insert, 있으면 skip)
4. Comment insert

### 동기화 실패 보완

댓글 작성 시점에 `ensureMeeting` 미들웨어가 Meeting upsert를 수행합니다.  
모임 생성 시 동기화가 실패했더라도 첫 댓글 작성 시 자동으로 복구됩니다.

---

## 환경 변수

```env
DATABASE_URL=       # Supabase Pooler 연결 문자열 (포트 6543)
DIRECT_URL=         # Supabase Direct 연결 문자열 (포트 5432)
MAIN_API_URL=       # 기존 백엔드 API URL
TEAM_ID=            # 팀 ID
NEXT_APP_URL=       # Next.js 서버 URL (CORS 허용 대상)
```

| 환경 | NEXT_APP_URL |
|---|---|
| 로컬 개발 | `http://localhost:3000` |
| Railway 배포 | `https://sosoeat.vercel.app` |

> `.env` 파일은 절대 Git에 커밋하지 않습니다.

---

## 프론트엔드 사용 가이드

### 환경 변수 설정

```env
# 서버 전용 — NEXT_PUBLIC 사용 금지
COMMENT_API_URL=https://sosoeat-comment.up.railway.app
```

### 인증 불필요 API (댓글 조회)

서버 컴포넌트에서 직접 호출 가능합니다.

```ts
const res = await fetch(
  `${process.env.COMMENT_API_URL}/meetings/${meetingId}/comments`
);
const comments = await res.json();
```

### 인증 필요 API (댓글 작성/수정/삭제)

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

  return Response.json(await res.json(), { status: res.status });
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

### 모임 생성/삭제 동기화

```ts
// 모임 생성
const createMeeting = async (formData) => {
  const meeting = await apiServer.post('/meetings', formData);

  try {
    await fetch(`${process.env.COMMENT_API_URL}/meetings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: meeting.id, hostId: meeting.hostId, teamId: meeting.teamId }),
    });
  } catch (e) {
    console.error('댓글 서버 동기화 실패:', e);
  }

  return meeting;
};

// 모임 삭제
const deleteMeeting = async (meetingId: number) => {
  await apiServer.delete(`/meetings/${meetingId}`);

  try {
    await fetch(`${process.env.COMMENT_API_URL}/meetings/${meetingId}`, {
      method: 'DELETE',
    });
  } catch (e) {
    console.error('댓글 서버 동기화 실패:', e);
  }
};
```

### 회원/비회원 판단

댓글 작성 UI는 Zustand `authStore`의 유저 정보 존재 여부로 1차 판단합니다.  
실제 토큰 유효성 검증(만료 토큰, 탈퇴 유저 등)은 `verifyMember` 미들웨어에서 2차로 처리합니다.

```ts
const { user } = useAuthStore();
// user 있으면 댓글 활성화, 없으면 비활성화
```
