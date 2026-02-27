# Geo Survivors Web - Project Guide

## Overview

기하학적 생존 .io 게임. PixiJS 8 + TypeScript + Vite 클라이언트, WebSocket(ws) 서버.
솔로 모드와 멀티플레이어 모드 지원. 멀티에서는 팀 기반 PvP + 공유 적.

## Tech Stack

- **Renderer**: PixiJS 8.16.0 (WebGL, Container/Graphics/Text)
- **Bundler**: Vite 7.3.1 (dev: port 3000)
- **Language**: TypeScript (strict)
- **Server**: HTTP + WebSocket unified server via `ws` 8.19.0 (port 8080), run with `npx tsx server/index.ts`
- **Shared types**: `shared/protocol.ts` (C2S/S2C message types, team colors, enemy defs)
- **Deployment**: Render.com — https://geo-survivors.onrender.com

## Commands

```bash
npx vite                # Dev server (port 3000)
npx vite build          # Build client to dist/
npx tsc --noEmit        # Type check
npx tsx server/index.ts # Unified HTTP+WS server (port 8080, serves dist/ + /ws)
```

## Project Structure

```
server/index.ts          # HTTP+WS 통합 서버
shared/protocol.ts       # C2S/S2C 메시지, 팀, 적 정의
src/
  main.ts                # 엔트리 (PixiJS → Game)
  core/Game.ts           # 메인 게임 루프 (핵심)
  core/Camera.ts         # 카메라
  core/Input.ts          # 키보드/터치 입력
  entities/Player.ts     # 로컬 플레이어
  entities/RemotePlayer.ts # 원격 플레이어 (보간, 무기 비주얼)
  entities/Enemy.ts      # 적 (AI, 데미지, serverX/Y 보간)
  entities/Boss.ts       # 보스 생성
  entities/Pickup.ts     # 아이템 픽업
  entities/XPOrb.ts      # XP 오브
  weapons/WeaponBase.ts  # 무기 추상 클래스
  weapons/OrbitWeapon.ts # 궤도 다이아몬드 (진화: Singularity)
  weapons/BulletWeapon.ts # 투사체/빔
  weapons/AreaWeapon.ts  # 범위 펄스/오라
  weapons/ChainLightning.ts # 체인 라이트닝
  weapons/ForceField.ts  # 포스 필드
  systems/               # ParticleSystem, DamageNumbers, ScreenShake, SoundManager, LevelUpSystem, Trail, i18n
  net/NetworkManager.ts  # WebSocket 클라이언트
  ui/UI.ts               # DOM UI (HUD, 타이틀, 레벨업, 게임오버, 부활, 미니맵, 킬로그, 채팅)
  utils/math.ts          # lerp, clamp 등
index.html               # HTML + CSS (UI 오버레이)
```

## Architecture

### 솔로 모드
- 모든 것이 클라이언트 로컬 (적 스폰/이동/충돌/죽음), 서버 연결 없음

### 멀티플레이어 모드
- **서버 권한 적**: 서버가 스폰/이동, 클라이언트는 `lerpToServer(dt)` 보간만 (dead reckoning 없음)
- **적 데미지**: `serverId >= 0`이면 비주얼 피드백만, 서버가 HP 관리
- **적 사망**: `enemy_death` 핸들러 → 항상 cleanup (dead 가드 없음)
- **PvP**: `checkHitPoint()`로 충돌 판정 → 서버 보고 → 상대에게 전달
- **팀**: blue/red/green/yellow 4팀, 밸런스 기반 자동 배정

### 네트워크 동기화 주기
| 데이터 | 주기 | 형식 |
|--------|------|------|
| 플레이어 상태 | 100ms | 전체 PlayerData |
| 적 위치/HP | 200ms | 압축 `[id,x,y,hp,flags]` |
| 점수판 | 2000ms | 팀 점수 + 리더보드 |

### 연결 흐름
1. WS_URL 연결 (dev: `ws://localhost:8080/ws`, prod: `wss://{host}/ws`)
2. `join` → `welcome` (ID, 팀, 기존 데이터) → `startGame()` (비동기)
3. 끊김 시 exponential backoff (1s→max 30s)

## Completed Features

- **맵**: 3000x3000px 바운더리 (서버+클라이언트), 시각 경계선/미니맵
- **적 스폰**: centroid 60% + 랜덤 플레이어 40%, 가중치 타겟팅
- **원격 무기 동기화**: `WeaponSyncData[]` 변경 시 전송, RemotePlayer에서 렌더링
- **Charger**: 서버 flags 동기화, OrbitWeapon pull: `pull_request` → 서버 위치 조정
- **웨이브 이벤트**: 60초마다, 엘리트 8%, 팀 버프 300px/8%, 핑(G키)
- **핑/킬로그 UI**, 적 스케일링, 난이도 곡선 `1+min*0.4+(min/10)^1.5`
- **사망 페널티**: 레벨1/XP0/무기초기화, 5초 대기 → 안전 위치 부활 (3초 무적)
- **사망 슬로모션**, 원격 사망 알림 (파티클+킬로그), 파티클 오브젝트 풀링
- **멀티 데미지 보고**: ChainLightning/beam `pendingHits[]` → `getHits()` 반환
- **배포**: Render.com, HTTP+WS 통합, env 설정, exponential backoff 재연결
- **채팅**: Enter로 열기/전송+닫기, Escape로 취소, 채팅 중 이동 차단
  - 모바일: 전송 버튼(➤) + 토글 버튼(💬↔✕), `enterkeyhint="send"`
  - PC: `chatJustClosed` 플래그로 Enter 전송 후 재열림 방지
  - 메시지 최대 100자, 화면 최대 10개, 8초 페이드 → 15초 제거
  - `NetworkManager.sendChat()` → 서버 브로드캐스트 → `UI.addChatMessage()` (HTML escape)
  - `Input.movementBlocked` 플래그로 채팅 중 이동 차단
- **핑**: G키 + 모바일 핑 버튼(SVG 원형), 같은 팀만 표시 (다른 팀 핑은 무시)
- **ForceField**: 둔화 필드 (솔로: 50%/evolved 70%, 멀티: 서버 50%) + 데미지 틱(0.4~0.2s)
  - 범위: 80/100/120/180(evolved), 서버 동기화, 슬로우 flags bit2로 클라이언트 전달
  - 슬로우 시각: 적 파란 틴트(0x6688ff), 필드 밝기 적 수에 따라 증가
  - 적 glow: radius+2 (body와 거의 일치), Player.radius=12
- **모바일 반응형 UI**: `@media 768px` (태블릿), `@media 480px` (모바일) — 레벨업 세로 스택, HUD/미니맵/채팅 축소

## Key Constants

### 서버
- 틱: 50ms (20Hz), 최대 적: 120/방, 최대 플레이어: 30/방
- 맵: 3000x3000px (±1500), 충돌 쿨다운: 0.8초/플레이어/적
- 보스: 120초, 웨이브: 60초, 엘리트: 8% (60초 이후)

### 클라이언트
- 솔로 최대 적: 250, PvP 쿨다운: 0.8초, PvP 데미지: 50%
- 부활: 5초 대기 + 3초 무적

## Weapon System

모든 무기 `WeaponBase` 상속: `update()`, `getHits()` (멀티=비주얼만), `checkHitPoint()` (PvP)

| 무기 | 설명 | 진화 |
|------|------|------|
| OrbitWeapon | 궤도 다이아몬드 (시작) | Singularity (끌어당기기) |
| BulletWeapon | 투사체/빔 | 관통빔 |
| AreaWeapon | 범위 펄스 | 영구 오라 |
| ChainLightning | 체인 번개 | 더 많은 타겟 |
| ForceField | 포스 필드 | 확장 범위 (knockback 솔로 전용) |

## Protocol Summary (shared/protocol.ts)

### Client → Server
`join`, `state`, `enemy_hit`, `pvp_hit`, `chat`, `ping`, `pull_request`

### Server → Client
`welcome`, `player_join/leave`, `players_sync`, `enemies_sync`, `enemy_spawn/death`,
`boss_spawn/update/dead`, `pvp_damage`, `team_scores`, `leaderboard`, `chat`,
`ping_signal`, `wave_event`

## Deployment

- **GitHub**: https://github.com/GreenSky03/Geo-Survivors
- **Live**: https://geo-survivors.onrender.com (Render.com Free, 15분 슬립)
- **Build**: `npm install && npx vite build` / **Start**: `npx tsx server/index.ts`
- **Port**: `process.env.PORT` || 8080
- **WS URL**: `VITE_WS_URL` fallback `wss://{host}/ws`
- **Health**: `GET /health`

## Team System
4팀: blue(`0x4488ff`), red(`0xff4466`), green(`0x44ff88`), yellow(`0xffcc44`)
- 같은 팀 PvP 불가, 보스 기여도 팀별 추적
