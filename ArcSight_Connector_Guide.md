# ArcSight Connector 구축 및 관리 가이드

## 목차
- [소개](#소개)
- [사전 요구사항](#사전-요구사항)
- [ArcSight Connector 설치](#arcsight-connector-설치)
- [Syslog Connector 구성](#syslog-connector-구성)
- [관리 베스트 프랙티스](#관리-베스트-프랙티스)
- [문제 해결](#문제-해결)
- [로그 위치](#로그-위치)
- [명령어](#명령어)

## 소개
이 문서는 ArcSight Connector 8.4.0.8955.0의 설치 및 구성 프로세스를 상세히 설명합니다. ArcSight SmartConnector는 다양한 로그 소스로부터 이벤트를 수집하고 정규화하여 ArcSight ESM과 같은 보안 정보 이벤트 관리(SIEM) 시스템으로 전송하는 데 사용됩니다.

## 사전 요구사항
- Linux 운영 체제 (RHEL 8.6 권장)
- ArcSight SmartConnector 설치 파일 (ArcSight-8.4.0.8955.0-Connector-Linux64.bin)
- 최소 4GB RAM
- 최소 10GB 디스크 공간
- 필요한 포트 개방 (Connector와 ArcSight ESM 간 통신을 위한 8443 및 로그 수집을 위한 사용자 정의 포트)
- root 또는 sudo 권한

## ArcSight Connector 설치
### 1. 설치 파일 준비
설치 전에 ArcSight Connector의 실행 권한을 확인합니다:
```bash
[root@test software]# pwd
/opt/software
[root@test software]# ll
-rwxrwxrwx. 1 root root 256842934  4  4 08:53 ArcSight-8.4.0.8955.0-Connector-Linux64.bin
-rw-r--r--. 1 root root 11465129984  3 27 14:31 rhel-8.6-x86_64-dvd.iso
```
실행 권한이 없다면 다음 명령어로 부여합니다:
```bash
chmod +x ArcSight-8.4.0.8955.0-Connector-Linux64.bin
```

### 2. Connector 설치 실행
콘솔 모드로 설치를 시작합니다:
```bash
./ArcSight-8.4.0.8955.0-Connector-Linux64.bin
```

### 3. 설치 위치 선택
컨벤션에 따라 대상 장치 이름을 포함한 명명 규칙을 권장합니다:
```
/opt/connectors/ex_41514_con1
```
위치 형식: `/opt/connectors/[장치타입]_[포트]_con[번호]`

### 4. 설치 완료 및 설정 시작
설치가 완료되면 아래 경로에서 설정 스크립트를 실행합니다:
```bash
/opt/connectors/ex_41514_con1/current/bin/runagentsetup.sh
```

## Syslog Connector 구성
### 1. 기본 설정
- 보안 파라미터 입력 숨김: `yes` (민감한 정보 보호)
- Generator ID: 기본 제안 또는 환경에 맞게 설정 (예: 44)
- FIPS 모드: 보안 요구사항에 따라 설정 (일반적으로 Disabled)
- 원격 관리: 필요에 따라 설정 (일반적으로 Disabled)

### 2. Connector 유형 선택
많은 유형 중에서 **Syslog Daemon (125번)** 선택:
- Type: Syslog Daemon

### 3. Syslog 파라미터 설정
- Network Port: 로그 수집 포트 (예: 41514)
- IP Address: 모든 인터페이스에서 수신하려면 (ALL)
- Protocol: 대개 UDP 선택
- Forwarder: 일반적으로 false

### 4. 대상 설정
- 대상 유형: ArcSight Manager (encrypted)
- Manager Hostname: ESM 서버 호스트명 (예: pnaesm)
- Manager Port: 일반적으로 8443
- User/Password: ESM 관리자 계정 정보

### 5. Connector 세부 정보
- Name: Connector 식별명 (예: ex_41514_con1)
- Location/DeviceLocation: 필요시 설정
- Comment: 부가 설명

### 6. 인증서 가져오기
- ESM 서버로부터 인증서를 가져옵니다:
> Import the certificate to connector from destination

### 7. 서비스로 설치
- Service Internal Name: 서비스 식별자 (예: ex_41514_con1)
- Service Display Name: 표시 이름 (예: ex_41514_con1)
- Start automatically: 일반적으로 Yes

### 8. 네트워크 설정 최적화
- Heartbeat Frequency: 기본값 10초 권장
- Enable Name Resolution: 성능을 위해 No 권장

## 관리 베스트 프랙티스
### 1. 명명 규칙
- 모든 Connector에 일관된 명명 규칙 적용
- 형식: `[장치타입]_[포트]_con[번호]` (예: ex_41514_con1, fw_secui_514_con1)

### 2. 포트 관리
- 각 Connector에 고유한 포트 할당
- 방화벽 규칙에 포트 개방 상태 유지
- 포트 충돌 방지를 위한 문서화

### 3. 성능 최적화
- Name Resolution 비활성화
- 적절한 캐시 및 배치 설정
- 대용량 로그 처리를 위한 메모리 할당 최적화

### 4. 로그 모니터링
- Connector 로그 정기 검토
- ArcSight ESM에서 Connector 상태 모니터링
- 로그 수집률 및 지연 시간 모니터링

### 5. 백업 및 복구
- Connector 설정 파일 정기 백업
- 주요 설정 변경 전 현재 상태 백업
- 복구 절차 문서화

## 문제 해결
### 일반적인 문제
#### 연결 실패
- ESM 서버 연결 확인
- 인증서 유효성 검증
- 방화벽 규칙 확인

#### 로그 수집 문제
- 소스 장치에서 로그 생성 확인
- 네트워크 포트 및 프로토콜 설정 검증
- `tcpdump`를 사용한 패킷 캡처로 로그 도달 여부 확인

#### 성능 저하
- 시스템 리소스 모니터링 (CPU, 메모리)
- 배치 설정 최적화
- 불필요한 파서 비활성화

## 로그 위치
주요 로그 파일 위치:
- `/opt/connectors/[connector_name]/current/logs/agent.log`
- `/opt/connectors/[connector_name]/current/logs/agent.out.log`

## 명령어
유용한 명령어:
- 서비스 상태 확인: `service [service_name] status`
- 서비스 재시작: `service [service_name] restart`
- 로그 테일링: `tail -f /opt/connectors/[connector_name]/current/logs/agent.log`