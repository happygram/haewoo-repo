# EC2 Docker + 로컬 테스트 순서(저비용)

요구사항:
- EC2에 `Docker` 설치
- EC2에 `Postgres`를 Docker로 먼저 구성
- 로컬에서 `frontend/backend` 실행하면서, CloudFront > S3 이미지 제공까지 먼저 구성 후 테스트

## 0) 권장 비용 세팅(초기)
- EC2: `t4g.micro` (ARM) 또는 `t3.micro` (x86)
- Docker로 `Postgres`를 EC2 내부에 직접 띄움(RDS보다 저렴하지만 백업/장애 대비는 필요)

## 1) EC2에서 Docker 설치
OS가 Ubuntu 계열이면:
- `sudo apt-get update`
- `sudo apt-get install -y docker.io docker-compose-plugin`
- `sudo systemctl enable --now docker`

Amazon Linux 계열이면:
- `sudo yum update -y`
- `sudo yum install -y docker`
- `sudo systemctl enable --now docker`

## 2) EC2에서 Postgres Docker 실행
아래 값은 예시입니다.

1. Docker 볼륨 생성(영속 저장)
   - `docker volume create pgdata`
2. Postgres 컨테이너 실행
   - `docker run -d --name postgres `
     `-e POSTGRES_DB=funeral_kiosk `
     `-e POSTGRES_USER=funeral `
     `-e POSTGRES_PASSWORD=change-me `
     `-p 5432:5432 `
     `-v pgdata:/var/lib/postgresql/data `
     `postgres:16`

## 3) 보안그룹(중요)
- 인바운드 `5432`는 **로컬 개발 PC IP만 허용**(예: `x.x.x.x/32`)
- 외부 어디서든 접속 가능하게 열지 마세요.
- 관리자 접속(SSH)은 `22`도 필요 IP만 허용 권장

## 4) 로컬 개발 PC에서 EC2 Postgres 연결 확인
로컬에서 `psql`이 있으면:
- `psql "postgres://funeral:change-me@<EC2_PUBLIC_IP>:5432/funeral_kiosk?sslmode=disable" -c "select 1;"`

## 5) CloudFront > S3 먼저 구성(이미지 GET용)
권장 흐름:
1. S3 버킷 생성(예: `funeral-kiosk-images-xxxx`)
2. Public Access Block: 전부 ON
3. Object Ownership: `Bucket owner enforced`(ACL 이슈 방지)
4. CloudFront 배포 생성
   - Origin: 방금 만든 S3 버킷
   - Origin Access Control(OAC) 사용
   - Default behavior: GET 허용(캐시 정책은 기본으로 시작 가능)
5. S3 버킷 정책에 CloudFront OAC principal에 대해 `s3:GetObject`만 허용

## 6) 로컬에서 backend-go 환경변수 설정
`backend-go/.env.example`을 `backend-go/.env`로 복사해서 아래만 채우세요.
- `DATABASE_URL` : EC2 public IP로 Postgres 연결
  - 예: `postgresql://funeral:change-me@<EC2_PUBLIC_IP>:5432/funeral_kiosk?sslmode=disable`
- `S3_BUCKET` : S3 버킷명
- `IMAGE_PUBLIC_BASE` : CloudFront 도메인(HTTPS)
  - 예: `https://dxxxx.cloudfront.net`
- `AWS_REGION` : 버킷 리전

추가로 로컬에서 S3 업로드(PUT)를 하려면 AWS 크리덴셜이 필요합니다.
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
(가능하면 IAM 권한은 `s3:PutObject`에 최소권한으로 제한)

## 7) 로컬에서 서버 실행
1. backend-go 실행
   - `cd backend-go && go run .`
   - 또는 `go build -o server . && ./server`
2. frontend 실행
   - `frontend/.env`의 `VITE_API_BASE`를 `http://localhost:3001`(또는 backend 로컬 주소)로 유지
   - `cd frontend && npm run dev`

## 8) 기능 테스트 순서(최소)
1. 관리자 로그인
2. Hall -> Room(27/32 선택) -> Device 등록
3. Slides 업로드(여러 장)
4. 키오스크 URL 열기
   - `GET /api/kiosk/device/:deviceId?deviceKey=...` 응답에 `imageUrl`이 CloudFront 기준인지 확인
5. 사진이 CloudFront를 통해 실제로 로드되는지 확인

## 9) 운영으로 가기(다음 단계)
원하면 다음을 맞춰서 “EC2에 frontend/backend를 Docker로 상시 실행” 형태로 확장 가능합니다.
- backend: Docker로 상시 실행
- frontend: (1) EC2/Nginx로 서빙하거나 (2) 빌드 결과를 S3에 업로드 후 CloudFront로 서빙(권장)

