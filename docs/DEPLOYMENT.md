# ArchiPanel Studio 접속과 배포

## 1. 이 PC에서 열기

`START_STUDIO.cmd`를 실행하고 `http://127.0.0.1:8766/`을 연다. 이 모드는 이 PC에서만 접속된다.

## 2. 같은 Wi-Fi의 다른 PC에서 열기

`START_STUDIO_LAN.cmd`를 실행한다. Windows의 IPv4 주소가 `192.168.0.20`이라면 다른 PC에서 `http://192.168.0.20:8766/`을 연다.

- 이 모드는 HTTPS나 로그인 보호를 제공하지 않으므로 신뢰하는 로컬 네트워크에서만 사용한다.
- Windows 방화벽이 연결을 묻는 경우 `개인 네트워크`만 허용한다.
- 공용 Wi-Fi나 인터넷 공유기 포트 포워딩에는 사용하지 않는다.

## 3. Tailscale로 다른 장소에서 열기

Studio를 `0.0.0.0:8766`으로 실행한 뒤 별도 HTTPS 포트를 연결한다.

```powershell
tailscale serve --bg --https=8443 --yes http://127.0.0.1:8766
tailscale serve status
```

표시된 `https://<기기명>.<tailnet>.ts.net:8443/` 주소는 같은 Tailscale 네트워크에 로그인한 기기에서만 열린다. 기존 443 포트 서비스를 덮어쓰지 않도록 Studio는 8443을 사용한다.

중지할 때는 다음을 실행한다.

```powershell
tailscale serve --https=8443 off
```

## 4. Docker로 자체 서버에 배포

`.env.example`을 `.env`로 복사하고 길고 고유한 암호로 바꾼 뒤 실행한다.

```powershell
Copy-Item .env.example .env
docker compose up --build -d
```

접속 시 브라우저 기본 인증 창에 `.env`의 사용자명과 암호를 입력한다. 업로드된 PSD/PSB 원본은 `archipanel-data` 볼륨에 보존된다.

Compose 기본 포트는 보안을 위해 `127.0.0.1:8766`에만 바인딩된다. 인터넷에 공개할 때는 Caddy·Nginx·Cloudflare Tunnel 등 HTTPS 역방향 프록시 뒤에 두고 프록시가 요청 본문 크기와 시간 제한을 지원하는지 확인한다. Basic Auth 암호를 평문 HTTP로 전송하지 않는다.

공개 모드는 다음을 강제한다.

- 기본 인증 암호가 없으면 편집기 접근 거부
- 서버 운영체제의 글꼴 목록·원본 글꼴 파일 비공개
- 단일 파일 256MB, 프로젝트 768MB, PSD/PSB 512MB 기본 한도
- `/api/health`만 인증 없이 상태 확인 허용

한도는 환경 변수로 늘릴 수 있지만 디스크 용량과 프록시 제한을 먼저 확인한다. 공개 서버에서는 프로젝트 전용 TTF/OTF/WOFF 파일을 업로드해 사용한다.

## 5. GitHub에서 Render로 배포

루트의 `render.yaml`은 싱가포르 리전의 Docker 웹 서비스, 5GB 영구 디스크, 상태 검사, 기본 인증 암호 입력을 정의한다. 다음 Blueprint 주소에서 GitHub 저장소를 연결한다.

`https://render.com/deploy?repo=https://github.com/tjwnsdhfz/archipanel-studio`

초기 화면에서 `ARCHIPANEL_AUTH_PASSWORD`를 직접 입력해야 한다. 이 구성은 1 CPU·2GB RAM과 영구 디스크를 사용하므로 유료 자원이 필요하다. Render의 디스크는 마운트 경로 아래 파일만 재배포 후 보존하므로 Studio는 `/var/lib/archipanel`만 영구 저장소로 사용한다.

## 기능 차이

| 기능 | Windows 로컬/Tailscale | Docker/Render |
|---|---:|---:|
| 패널 편집·IndexedDB 저장 | 지원 | 지원 |
| PDF/PNG/JPG 출력 | 지원 | 지원 |
| PSD/PSB 청크 업로드·레이어 검사 | 지원, 최대 2GB | 지원, 기본 512MB |
| Windows/KoPub 시스템 글꼴 검색 | 지원 | 차단, 프로젝트 글꼴 업로드 사용 |
| 설계설명서 PDF | 지원 | 지원 |
| 렌더 검증 포함 PPTX | 지원 | 별도 PPTX 워커 연결 전 503 |

현재 PPTX 렌더러는 로컬 Codex Artifact Tool 런타임에 의존하며 공개 npm 패키지가 아니다. 따라서 해당 비공개 런타임을 컨테이너 이미지에 복사하지 않는다. Docker에서 PPTX 버튼을 누르면 모호한 500 오류 대신 명시적인 503 안내를 반환한다. 공개 웹의 완전한 PPTX 지원은 공개 배포 가능한 렌더 워커를 교체 구현하고 슬라이드별 렌더 QA를 다시 통과한 뒤 활성화한다.

## 배포 확인

```powershell
Invoke-WebRequest https://YOUR-HOST/api/health
```

응답의 `deploymentMode`, `authenticationRequired`, `limits`, `capabilities`를 확인한다. 실제 배포 완료로 보고하려면 최종 HTTPS 주소에서 상태 응답, 인증 차단, 로그인 후 앱 로드, 파일 업로드와 PDF 출력까지 다시 확인한다.
