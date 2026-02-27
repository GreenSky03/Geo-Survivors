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
server/index.ts          # HTTP+WS 통합 서버 (정적 파일 서빙 + WebSocket 게임 서버)
.env.development         # 개발용 환경변수 (VITE_WS_URL=ws://localhost:8080/ws)
.env.example             # 배포용 환경변수 템플릿
shared/protocol.ts       # 공유 타입 정의 (C2S/S2C 메시지, 팀, 적 정의)
src/
  main.ts                # 엔트리 포인트 (PixiJS 앱 생성 → Game)
  core/
    Game.ts              # 메인 게임 루프 (1100+줄, 가장 핵심 파일)
    Camera.ts            # 카메라 팔로우/줌
    Input.ts             # 키보드/터치 입력
  entities/
    Player.ts            # 로컬 플레이어 (이동, HP, 무적, 데미지, 맵바운더리 클램핑)
    RemotePlayer.ts      # 원격 플레이어 (보간, HP바, 무기 비주얼)
    Enemy.ts             # 적 엔티티 (이동, AI, 데미지, 비주얼, serverX/Y 보간)
    Boss.ts              # 보스 생성 헬퍼
    Pickup.ts            # 아이템 픽업
    XPOrb.ts             # XP 오브
  weapons/
    WeaponBase.ts        # 무기 추상 클래스 (getHits, checkHitPoint)
    OrbitWeapon.ts       # 궤도 다이아몬드 (진화: Singularity, useServerPull)
    BulletWeapon.ts      # 투사체/빔 무기
    AreaWeapon.ts        # 범위 펄스/오라
    ChainLightning.ts    # 체인 라이트닝
    ForceField.ts        # 포스 필드
  systems/
    ParticleSystem.ts    # 파티클 이펙트
    DamageNumbers.ts     # 데미지 숫자 표시
    ScreenShake.ts       # 화면 흔들림
    SoundManager.ts      # 사운드
    LevelUpSystem.ts     # 레벨업 선택지
    Trail.ts             # 이동 궤적
    i18n.ts              # 다국어 (한/영)
  net/
    NetworkManager.ts    # WebSocket 클라이언트 (연결/재연결/이벤트/지연시간)
  ui/
    UI.ts                # DOM UI (HUD, 타이틀, 레벨업, 게임오버, 부활, 미니맵, 킬로그)
  utils/math.ts          # lerp, clamp 등
index.html               # HTML + CSS (UI 오버레이, 부활 화면, 핑/킬로그 UI 포함)
vite.config.ts           # Vite 설정
```

## Architecture

### 솔로 모드
- 모든 것이 클라이언트 로컬: 적 스폰/이동/충돌/죽음 모두 클라이언트에서 처리
- 서버 연결 없음

### 멀티플레이어 모드
- **서버 권한(Server-Authoritative) 적**: 서버가 적을 스폰/이동, 클라이언트는 서버 위치로 보간만 수행
- **적 이동**: 멀티에서 `enemy.update()` 호출 안 함 → `enemy.lerpToServer(dt)` 로 서버 위치(`serverX`,`serverY`)를 향해 보간
- **적 데미지**: `Enemy.takeDamage()` — `serverId >= 0`이면 비주얼 피드백만 (HP 변경/dead 설정 안 함), 서버가 HP 관리
- **적 사망**: `enemy_death` 핸들러에서 `!enemy.dead` 가드 없음 → 서버 통보 시 항상 cleanup 실행
- **PvP**: 무기의 `checkHitPoint()`로 실제 투사체 충돌 판정 → 서버에 보고 → 상대에게 전달
- **팀**: blue/red/green/yellow 4팀, 밸런스 기반 자동 배정

### 네트워크 동기화 주기
| 데이터 | 주기 | 형식 |
|--------|------|------|
| 플레이어 상태 | 100ms | 전체 PlayerData |
| 적 위치/HP | 200ms | 압축 `[id,x,y,hp,flags]` |
| 점수판 | 2000ms | 팀 점수 + 리더보드 |

### 연결 흐름
1. 클라이언트가 WS_URL에 연결 (dev: `ws://localhost:8080/ws`, prod: `wss://{host}/ws`)
2. `join` 메시지 전송 (이름, 방코드)
3. 서버가 `welcome` 응답 (ID, 팀, 기존 플레이어/적/보스 목록)
4. `welcome` 수신 후 `startGame()` 호출 (비동기)
5. 연결 끊김 시 exponential backoff 재연결 (1s→2s→4s→...max 30s)

## Completed Phases (2026-02-26)

### Phase 1: 맵 바운더리 + 적 스폰 개선
- 맵 바운더리 3000x3000px (서버+클라이언트 양쪽 제한)
- 바운더리 시각화: 빨간 경계선 + 코너 마커 + 미니맵 표시
- 적 스폰: **centroid 기반** (60% centroid 근처, 40% 랜덤 플레이어 근처)
- 적 AI: **가중치 기반 타겟팅** (70% nearest, 15% centroid, 15% weakest)

### Phase 2: 원격 플레이어 무기 동기화
- `state` 메시지에 `weapons: WeaponSyncData[]` 추가 (변경 시에만 전송)
- `RemotePlayer.ts`에 `WEAPON_VISUALS` 레코드로 무기별 렌더링 (orbit, bullet, area, lightning, forcefield)

### Phase 3: Charger 수정 + OrbitWeapon Pull 재활성화
- `enemies_sync`에 5-element 포맷: `[id, x, y, hp, flags]` (flags: bit0=charging, bit1=elite)
- OrbitWeapon Pull: 서버에 `pull_request` 메시지 전송 → 서버가 적 위치 조정

### Phase 4: 상호작용 강화
- **웨이브 이벤트**: 60초마다 centroid 주변 대규모 적 웨이브 스폰
- **엘리트 적**: 8% 확률, HP 3배, 데미지 1.5배, XP 3배, 시각적 1.5배 크기
- **팀 버프**: 300px 이내 팀원 수 × 8% 속도/데미지 보너스
- **핑 시스템**: G키로 핑, 미니맵+월드에 표시, 서버 브로드캐스트

### Phase 5: 품질 개선
- 핑(지연시간) 표시
- 킬 로그 UI
- 적 HP/데미지 플레이어 수 스케일링

### 버그 수정 (2026-02-27 세션 1)
- ~~적이 플레이어별로 개별 이동~~ → 멀티에서 `enemy.update()` 제거, `lerpToServer()` 만 사용
- ~~죽인 적이 유령처럼 남음~~ → `takeDamage()`에서 serverId>=0이면 비주얼만, `enemy_death`에서 `!dead` 가드 제거
- ~~PvP 데미지 불가~~ → 위 두 버그 수정으로 플레이어들이 같은 공간에서 조우하게 됨

### 기능 추가 + 밸런싱 + 배포 (2026-02-27 세션 2)

**Phase 1: 패시브 플레이버 텍스트** (`i18n.ts`)
- 패시브 5종 이름/설명을 창의적으로 변경 (Iron Constitution, Phantom Step, Gravitational Pull, Vital Surge, Tenacious Vitality)

**Phase 2: 무기 데미지 미보고 버그 수정**
- ChainLightning: `pendingHits[]` 추가 → `getHits()`가 반환 → Game.ts 히트 루프에서 `enemy_hit` 서버 전송
- BulletWeapon (evolved beam): `pendingBeamHits[]` 추가 → 동일 방식
- AreaWeapon: 이미 `getHits()` 내에서 정상 동작 확인 (수정 불필요)

**Phase 3: 사망 페널티 — 완전 초기화** (`Game.ts`, `index.html`, `UI.ts`)
- 멀티 리스폰 시 무기 전부 제거 → OrbitWeapon만 재지급, 레벨 1, XP 0 초기화
- "ALL PROGRESS LOST" / "모든 진행 초기화" 경고 텍스트 (i18n 지원)

**Phase 4: 게임 밸런싱**
- 난이도 곡선: `1 + min*0.4 + (min/10)^1.5` (클라이언트+서버 모두)
- 속도 패시브 상한: 500
- 자석 범위 +30 → +50
- 픽업 드롭률 4% → 6% (heal 2.5%, magnet 1.5%, bomb 2%)
- 후반 XP 보너스: `amount * (1 + gameTime/300)` — 5분마다 +100%

**Phase 5: 온라인 멀티플레이 배포**
- WS_URL 환경변수화: `VITE_WS_URL` → fallback `wss://{host}/ws`
- HTTP+WS 통합 서버: `dist/` 정적 서빙 + `/ws` WebSocket + `/health` 헬스체크
- `.env.development` + `.env.example` 생성
- Exponential backoff 재연결 (1s→2s→4s→...max 30s, UI에 시도 횟수 표시)
- Render.com 배포 완료: https://geo-survivors.onrender.com

## Pending Bugs

현재 알려진 미해결 버그 없음.

## Resolved Issues (전체)
- ~~적이 플레이어별로 개별 이동~~ → 멀티에서 클라이언트 AI 완전 제거, 서버 위치 보간만
- ~~죽인 적 유령~~ → takeDamage 비주얼 전용 + enemy_death 가드 제거
- ~~PvP 불가~~ → 적 공유로 자연스러운 조우
- ~~Charger 떨림~~ → 서버 charging 상태 동기화
- ~~OrbitWeapon pull 비활성화~~ → 서버 pull_request로 재활성화
- ~~ChainLightning/beam 멀티 데미지 미보고~~ → pendingHits 패턴으로 getHits() 반환
- ~~RemotePlayer 무기 구체로 표시~~ → rotation 간섭 해결 + sync 누락 수정
- ~~레벨업 창 8초 자동 닫힘~~ → setTimeout 제거, 유저 직접 선택
- ~~적 이동 끊김~~ → dead reckoning 방식으로 lerpToServer() 개선

## Death/Respawn System (Multiplayer)

- 죽으면 "ELIMINATED" + "ALL PROGRESS LOST" 오버레이 표시 (빨간 펄스 텍스트 + 카운트다운 + 프로그레스바)
- 5초 대기 후 안전한 위치에 부활 (적으로부터 가장 먼 곳 8개 후보 중 선택)
- 부활 시 3초 무적 (깜빡임 이펙트)
- **사망 페널티**: 레벨 1, XP 0, 무기 OrbitWeapon만으로 완전 초기화
- HTML: `#respawn-overlay`, `#death-penalty-text` (index.html)
- JS: `UI.showRespawnOverlay()`, `updateRespawnTimer()`, `hideRespawnOverlay()`

## Key Constants

### 서버
- 틱: 50ms (20Hz)
- 최대 적: 120/방
- 최대 플레이어: 30/방
- 맵 크기: 3000×3000px (±1500)
- 적 스폰: centroid 기반 (60%) + 랜덤 플레이어 근처 (40%)
- 적 충돌 쿨다운: 0.8초/플레이어/적
- 보스 주기: 120초
- 웨이브 이벤트 주기: 60초
- 엘리트 확률: 8% (60초 이후)

### 클라이언트
- 솔로 최대 적: 250
- PvP 쿨다운: 0.8초/무기/대상
- PvP 데미지: 무기 데미지의 50%
- 부활 시간: 5초
- 부활 무적: 3초

## Weapon System

모든 무기는 `WeaponBase` 상속. 주요 메서드:
- `update(dt, playerX, playerY)`: 매 프레임 업데이트
- `getHits(enemies)`: 적 히트 판정 (멀티에서는 비주얼만, HP 변경 안 함)
- `checkHitPoint(x, y, radius)`: PvP 히트 판정 (점 충돌)

### 무기 목록
| 무기 | 설명 | 진화 |
|------|------|------|
| OrbitWeapon | 궤도 다이아몬드 (시작 무기) | Singularity (끌어당기기) |
| BulletWeapon | 투사체/빔 | 관통빔 |
| AreaWeapon | 범위 펄스 | 영구 오라 |
| ChainLightning | 체인 번개 | 더 많은 타겟 |
| ForceField | 포스 필드 | 확장 범위 |

## Protocol Summary (shared/protocol.ts)

### Client → Server
- `join`: 이름, 방코드
- `state`: x, y, level, kills, hp, maxHp, rotation, weapons?
- `enemy_hit`: enemyId, damage
- `pvp_hit`: targetId, damage
- `chat`: msg
- `ping`: x, y (핑 시그널)
- `pull_request`: x, y, strength, radius (OrbitWeapon pull)

### Server → Client
- `welcome`: id, team, roomCode, players[], enemies[], boss, nextBossTime
- `player_join/leave`: 플레이어 입퇴장
- `players_sync`: 모든 플레이어 상태 (weapons 포함 시)
- `enemies_sync`: 압축 적 데이터 `[id,x,y,hp,flags,...]` (flags: bit0=charging, bit1=elite)
- `enemy_spawn/death`: 개별 적 생성/사망
- `boss_spawn/update/dead`: 보스 이벤트
- `pvp_damage`: 피격 알림
- `team_scores/leaderboard`: 점수
- `ping_signal`: x, y, team, playerName (핑 브로드캐스트)
- `wave_event`: waveNumber, enemyCount (웨이브 이벤트)

## Deployment

- **GitHub**: https://github.com/GreenSky03/Geo-Survivors
- **Live**: https://geo-survivors.onrender.com (Render.com Free)
- **Build Command**: `npm install && npx vite build`
- **Start Command**: `npx tsx server/index.ts`
- **Port**: `process.env.PORT` (Render 자동 주입) || 8080
- **WS URL**: 프로덕션에서 `VITE_WS_URL` 미설정 → 자동 `wss://{host}/ws`
- **Health**: `GET /health` → `{"status":"ok","rooms":N}`
- **Static**: `dist/` 폴더에서 서빙 (SPA fallback 포함)
- **주의**: Free 요금제 15분 무활동 시 슬립 → 첫 접속 30초 대기

## Team System
4팀: blue(`0x4488ff`), red(`0xff4466`), green(`0x44ff88`), yellow(`0xffcc44`)
- 같은 팀 PvP 불가 (Game.ts에서 팀 체크)
- 보스 기여도 팀별 추적
