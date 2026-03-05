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
  weapons/BoomerangWeapon.ts # 부메랑 (진화: Blade Storm)
  weapons/HomingMissileWeapon.ts # 유도 미사일 (진화: Cluster Barrage)
  systems/RelicSystem.ts # 유물 시스템 (런 스코프 패시브)
  systems/LevelUpSystem.ts # 레벨업 선택지 생성
  systems/i18n.ts        # 국제화 (en/ko)
  systems/               # ParticleSystem, DamageNumbers, ScreenShake, SoundManager, Trail
  net/NetworkManager.ts  # WebSocket 클라이언트
  ui/UI.ts               # DOM UI (HUD, 타이틀, 레벨업, 게임오버, 부활, 미니맵, 킬로그, 채팅)
  utils/math.ts          # lerp, clamp 등
index.html               # HTML + CSS (UI 오버레이)
```

## Architecture

### 솔로 모드
- 모든 것이 클라이언트 로컬 (적 스폰/이동/충돌/죽음), 서버 연결 없음
- 난이도: 시간 기반 스케일링

### 멀티플레이어 모드
- **서버 권한 적**: 서버가 스폰/이동, 클라이언트는 `lerpToServer(dt)` velocity 외삽 + adaptive lerp
- **적 데미지**: `serverId >= 0`이면 비주얼 피드백만, 서버가 HP 관리
- **적 사망**: `enemy_death` 즉시 broadcast (sync 주기와 무관), 클라이언트 항상 cleanup
- **PvP**: `checkHitPoint()`로 충돌 판정 → 서버 보고 → 상대에게 전달
- **팀**: blue/red/green/yellow 4팀, 밸런스 기반 자동 배정
- **동적 난이도**: 시간 무관, 순수 플레이어 상태 기반 (레벨, 인원, 유물)

### 네트워크 동기화 주기
| 데이터 | 주기 | 형식 |
|--------|------|------|
| 플레이어 상태 | 16ms (매 틱) | PlayerData + relicCount |
| 적 위치/HP | 16ms (매 틱) | 압축 `[id,x,y,hp,flags,vx,vy]` + velocity 외삽 |
| 적 사망 | 즉시 | enemy_death (HP<=0 판정 시 바로 broadcast) |
| 점수판 | 2000ms | 팀 점수 + 리더보드 |

### 파티 시스템
- **생성**: CREATE PARTY → `connect()` → `join` → `create_party` → 서버가 4자 코드 생성 → `party_created`
- **참가**: JOIN PARTY → `connect()` → `join` → `join_party(code)` → 서버가 멤버 추가 → `party_joined`
- **시작**: 리더가 START → `party_start` → 서버가 방 생성 → 전체 멤버에 `party_game_start(roomCode)`
- **게임 진입**: `party_game_start` → 캐릭터 선택 → `connectMultiplayer(partyRoomCode)` → 같은 방/팀 진입
- 최대 4명/파티, 서버 `__partyCode` WS 속성으로 추적
- BACK 버튼: WS 연결 해제 + 파티 변수 초기화
- `quitToTitle()`: 파티 변수 전부 리셋 (partyRoomCode, pendingPartyAction 등)

### 연결 흐름
1. WS_URL 연결 (dev: `ws://localhost:8080/ws`, prod: `wss://{host}/ws`)
2. `join` → `welcome` (ID, 팀, 기존 데이터) → `startGame()` (비동기)
3. 끊김 시 exponential backoff (1s→max 30s)

## Completed Features

- **맵**: 3000x3000px 바운더리 (서버+클라이언트), 시각 경계선/미니맵
- **적 스폰**: centroid 60% + 랜덤 플레이어 40%, 가중치 타겟팅
- **원격 무기 동기화**: `WeaponSyncData[]` 변경 시 전송, RemotePlayer에서 렌더링
- **Charger**: 서버 flags 동기화, OrbitWeapon pull: `pull_request` → 서버 위치 조정
- **동적 난이도 (멀티)**: `getRoomDifficulty()` = `(1 + avgLevel*0.4 + aliveCount*0.3 + relics*0.15) * aliveScale`
  - 시간 요소 없음, 순수 플레이어 상태 기반
  - 플레이어 사망 시 난이도 하락 → 적 감축 (먼 적부터 제거)
  - 유물 스택이 난이도에 반영 (relicCount 서버 전송)
- **웨이브 이벤트**: 60초마다, 엘리트 8%, 팀 버프 300px/8%, 핑(G키)
- **핑/킬로그 UI** (로컬라이징 적용), 적 스케일링
- **사망 페널티**: 레벨1/XP0/무기초기화 (유물은 유지), 5초 대기 → 안전 위치 부활 (3초 무적)
  - 리스폰 시 유물 효과 재적용 (glass cannon maxHp, magnet bonus, speed 등)
- **사망 슬로모션**, 원격 사망 알림 (파티클+킬로그), 파티클 오브젝트 풀링
- **멀티 데미지 보고**: ChainLightning/beam `pendingHits[]` → `getHits()` 반환
- **배포**: Render.com, HTTP+WS 통합, env 설정, exponential backoff 재연결
- **채팅**: Enter로 열기/전송+닫기, Escape로 취소, 채팅 중 이동 차단
  - 모바일: 전송 버튼(➤) + 토글 버튼(💬↔✕), `enterkeyhint="send"`
  - PC: `chatJustClosed` 플래그로 Enter 전송 후 재열림 방지
  - 메시지 최대 100자, 화면 최대 10개, 8초 페이드 → 15초 제거
  - placeholder 로컬라이징 적용
- **핑**: G키 + 모바일 핑 버튼(SVG 원형), 같은 팀만 표시, 안내 문구 로컬라이징
  - 핑 안내와 채팅 위치 분리 (bottom 140px vs 160px)
- **ForceField**: 둔화 필드 (솔로: 50%/evolved 70%, 멀티: 서버 50%) + 데미지 틱(0.4~0.2s)
  - 범위: 80/100/120/180(evolved), 서버 동기화, 슬로우 flags bit2로 클라이언트 전달
  - 슬로우 시각: 적 파란 틴트(0x6688ff), 필드 밝기 적 수에 따라 증가
  - 적 glow: radius+6, Player.radius=10 (삼각형 내접원)
- **모바일 반응형 UI**: `@media 768px` (태블릿), `@media 480px` (모바일) — 레벨업 세로 스택, HUD/미니맵/채팅 축소
- **타이틀 복귀**: 게임오버 화면 + 멀티 사망 오버레이에 TITLE 버튼 추가
- **유물 시스템**: 12종 유물, 25% 확률로 레벨업 풀에 등장, 사망 시 유지
- **i18n**: 핑 안내, 채팅 placeholder, 리스폰 오버레이 텍스트 로컬라이징 (en/ko)
- **파티 시스템**: CREATE/JOIN/QUICK START, 4자 코드, 최대 4명, 리더만 시작 가능
  - 멤버 리스트 실시간 동기화 (배열 기반 + updatePartyMembers)
  - 리더 이탈 시 자동 리더 이전, 빈 파티 자동 삭제
  - BACK 버튼: WS 연결 해제 + 파티 상태 전체 초기화
  - 참가자: START 버튼 숨김 (리더만 표시)

## Key Constants

### 서버
- 틱: 16ms (60Hz), 최대 적: 120/방, 최대 플레이어: 30/방
- 맵: 3000x3000px (±1500), 충돌 쿨다운: 0.8초/플레이어/적
- 보스: 120초, 웨이브: 60초, 엘리트: 8% (60초 이후)
- maxPayload: 8KB (클라이언트→서버)
- 파티: 최대 4명, 4자 코드 (ABCDEFGHJKLMNPQRSTUVWXYZ23456789)

### 클라이언트
- 솔로 최대 적: 250, PvP 쿨다운: 0.8초, PvP 데미지: 50%
- 부활: 5초 대기 + 3초 무적
- Stale enemy cleanup: 4초 미응답 시 자동 제거
- 클라이언트 state 전송: 16ms (서버 틱에 맞춤)

## Weapon System

모든 무기 `WeaponBase` 상속: `update()`, `getHits()` (멀티=비주얼만), `checkHitPoint()` (PvP)

| 무기 | 설명 | 진화 |
|------|------|------|
| OrbitWeapon | 궤도 다이아몬드 (시작) | Singularity (끌어당기기) |
| BulletWeapon | 투사체/빔 | 관통빔 |
| AreaWeapon | 범위 펄스 | 영구 오라 |
| ChainLightning | 체인 번개 | 더 많은 타겟 |
| ForceField | 둔화 필드 (50%, evolved 70%) | Event Horizon (180 범위) |
| BoomerangWeapon | 부메랑 | Blade Storm (나선 회전) |
| HomingMissileWeapon | 유도 미사일 | Cluster Barrage (분열) |

## Relic System

12종 유물, 런 스코프 패시브. 사망 시 유지 (레벨/무기만 초기화).
레벨업 시 25% 확률로 1개 유물이 선택지 풀에 등장.

| 유물 | 효과 | 최대 스택 |
|------|------|----------|
| glass_cannon | 데미지 +50%, maxHp 절반 | 1 |
| vampiric_touch | 흡혈 5%/스택 | 3 |
| thorns | 반사 30%/스택 | 2 |
| lucky_star | 치명타 +10%, 배율 +0.5x/스택 | 3 |
| magnet_core | 자석 범위 +80/스택 | 2 |
| swift_boots | 이동속도 +15%/스택 | 2 |
| cooldown_gem | 쿨타임 -10%/스택 | 3 |
| area_amplifier | 무기 범위 +20%/스택 | 2 |
| xp_siphon | XP 획득 +25%/스택 | 2 |
| gold_fever | 종료 시 코인 +50%/스택 | 2 |
| regen_orb | HP 재생 +2/초/스택 | 3 |
| last_stand | HP 30% 이하 시 데미지 +80% | 1 |

유물 적용 위치:
- `speedMultiplier`: 매 프레임 `basePlayerSpeed * mults.speedMultiplier` (Game.ts)
- `magnetBonus`: `baseMagnetRange + mults.magnetBonus` (절대값, 누적 방지)
- `maxHpMultiplier`: 유물 선택 시 + 리스폰 시 재적용
- 나머지: 매 프레임 computeMultipliers() → 무기/판정에 적용

## Multiplayer Difficulty Formula

```
difficulty = (1 + avgLevel*0.4 + aliveCount*0.3 + totalRelics*0.15) * aliveScale
aliveScale = 0.15 + 0.85 * (aliveCount / totalPlayers)
```

- **시간 요소 없음** — 순수 플레이어 상태 기반
- 플레이어 사망 → aliveScale 감소 → 스폰 제한 + 먼 적 감축
- 전원 사망 시 aliveScale = 0.15 (스폰 거의 중단)
- 유물 스택이 난이도에 반영 (relicCount를 C2S_State로 서버 전송)

## Protocol Summary (shared/protocol.ts)

### Client → Server
`join`, `state` (+ relicCount), `enemy_hit`, `pvp_hit`, `chat`, `ping`, `pull_request`,
`create_party`, `join_party`, `party_start`

### Server → Client
`welcome`, `player_join/leave`, `players_sync`, `enemies_sync`, `enemy_spawn/death`,
`boss_spawn/update/dead`, `pvp_damage`, `team_scores`, `leaderboard`, `chat`,
`ping_signal`, `wave_event`, `event_wave_start/end`, `blackhole_spawn/sync/despawn`,
`party_created`, `party_joined`, `party_member_join/leave`, `party_error`, `party_game_start`

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

## Known Issues (lower priority)

- Game.ts ~2300줄 God Class → 모듈화 필요 (EnemyManager, WeaponManager 등)
- server/index.ts ~1800줄 God File → 모듈화 필요
- 서버 O(enemies × players) brute-force 충돌 → 공간 분할 필요
- Boss 프로젝타일 데미지 서버측 미구현 (멀티에서 무해)
- 이벤트 리스너 정리 부재 (Game.ts init, UI.ts)
- 파티 리더 이탈 시 나머지 멤버에게 리더 변경 미통보 (party_leader_change 이벤트 없음)
- 파티 시작 시 멤버 준비 확인 없음 (네트워크 지연 시 레이스 컨디션)
- welcome 핸들러가 파티 설정 중에도 showRoomInfo/showMultiplayerUI 호출 (cosmetic)
- 테스트 파일 0건

## Recently Fixed

- **파티 참가 미작동**: `onPartyJoin`이 party code를 `roomCode`로 잘못 전달 → `join_party` 메시지 미전송. connect 후 `sendJoinParty(code)` 전송으로 수정
- **파티 코드 변경**: `net.on('connected')` 핸들러 누적 → 재연결 시 `sendCreateParty()` 중복 호출. `pendingPartyAction` 상태 기반 단일 핸들러로 통합
- **멤버 리스트 미표시**: DOM ID 오류 (`party-members` → `party-members-list`) + `appendChild` 비일관. 배열 기반 `partyMembers[]` + `updatePartyMembers()` 통일
- **참가자 화면 미전환**: `join_party` 미전송 → `party.members`에 미등록 → `party_game_start` 미수신. 위 수정으로 해결
- **onPartyStart 레이스 컨디션**: 서버 응답 전 UI 전환 제거, `party_game_start` 핸들러에서만 전환
- **quitToTitle 파티 변수 미초기화**: partyRoomCode, pendingPartyAction 등 리셋 추가
- **BACK 버튼 미정리**: WS 연결 해제 + 파티 변수 초기화 콜백 (`onPartyBack`) 추가
- **참가자 START 버튼**: 조이너에게 START 버튼 숨김 (리더만 표시)
- **유물 speedMultiplier 미적용**: `basePlayerSpeed` 추가, 매 프레임 적용
- **리스폰 시 유물 효과 미재적용**: glass cannon maxHp, magnet bonus 등 리스폰 후 재적용
- **핑 안내 로컬라이징**: 하드코딩 영문 → i18n 키 (`ping.hint`, `chat.placeholder` 등)
- **핑/채팅 위치 겹침**: bottom 140px vs 160px로 분리
- **멀티 난이도 시간 의존**: 시간 요소 완전 제거, 플레이어 상태만 반영
- **동기화 지연**: 100ms → 16ms (60Hz 매 틱), 클라이언트도 16ms
- **메인화면 복귀**: 게임오버 + 사망 오버레이에 TITLE 버튼 추가
