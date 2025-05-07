# ArcSight Connector 구축 및 관리 가이드

## 목차
- [개요](#개요)
- [아키텍처 및 구성요소](#아키텍처-및-구성요소)
- [설치 사전 요구사항](#설치-사전-요구사항)
- [ArcSight Connector 설치 절차](#arcsight-connector-설치-절차)
- [Syslog Connector 상세 구성](#syslog-connector-상세-구성)
- [보안 강화 설정](#보안-강화-설정)
- [운영 및 관리 베스트 프랙티스](#운영-및-관리-베스트-프랙티스)
- [성능 최적화](#성능-최적화)
- [문제 해결 가이드](#문제-해결-가이드)
- [부록: 유용한 로그 및 명령어](#부록-유용한-로그-및-명령어)

## 개요
본 문서는 보안 이벤트 모니터링 및 관리를 위한 ArcSight SmartConnector v8.4.0.8955.0의 설치 및 운영 절차를 상세히 기술합니다. ArcSight SmartConnector는 다양한 보안 장비 및 애플리케이션에서 발생하는 이벤트 로그를 수집하여 정규화한 후 ArcSight ESM과 같은 SIEM(Security Information and Event Management) 플랫폼으로 안전하게 전송하는 핵심 구성요소입니다.

## 아키텍처 및 구성요소
ArcSight Connector는 다음과 같은 주요 구성요소로 이루어집니다:

- **Event Collection**: 다양한 소스로부터 로그 수집
- **Parser/Normalization**: 이기종 로그 포맷 정규화
- **Filtering/Aggregation**: 중요도에 따른 필터링 및 집계
- **Secure Transport**: 암호화된 전송 채널
- **Caching/Batching**: 성능 최적화 및 데이터 손실 방지

## 설치 사전 요구사항

### 시스템 요구사항
- **운영체제**: RHEL/CentOS 8.6 이상 (64비트)
- **CPU**: 최소 4코어 (대용량 로그 처리 시 8코어 이상 권장)
- **메모리**: 최소 4GB RAM (대용량 처리 시 8GB 이상 권장)
- **디스크 공간**: 
  - 시스템 영역: 최소 10GB
  - 로그 저장 영역: 최소 50GB (로그 보관 정책에 따라 조정)
- **네트워크**: 최소 1Gbps 이더넷 인터페이스

### 필수 패키지 및 종속성
```bash
# 기본 패키지 설치
sudo yum install -y java-11-openjdk-devel openssl curl net-tools

# 시스템 최적화를 위한 패키지
sudo yum install -y tuned
sudo systemctl enable --now tuned
sudo tuned-adm profile throughput-performance
```

### 네트워크 요구사항
- Connector와 ESM 간 통신을 위한 포트 개방 (기본값: TCP 8443)
- 로그 수집을 위한 Syslog 포트 개방 (사용자 정의, 예: UDP/TCP 514, 1514, 41514 등)
- 방화벽 설정 예시:
```bash
# Firewalld 설정 예시
sudo firewall-cmd --permanent --add-port=41514/udp
sudo firewall-cmd --permanent --add-port=8443/tcp
sudo firewall-cmd --reload
```

## ArcSight Connector 설치 절차

### 1. 설치 파일 준비
설치 바이너리에 실행 권한을 부여합니다:
```bash
mkdir -p /opt/software
cd /opt/software
chmod +x ArcSight-8.4.0.8955.0-Connector-Linux64.bin
```

### 2. 설치 위치 규칙
아래 명명 규칙을 준수하여 Connector를 설치합니다:
```
/opt/connectors/[장비유형]_[포트]_con[번호]
```

예시:
- 방화벽 로그 수집: `/opt/connectors/fw_514_con1`
- 웹서버 로그 수집: `/opt/connectors/web_1514_con1`
- 응용프로그램 로그 수집: `/opt/connectors/app_41514_con1`

### 3. 설치 실행
콘솔 모드로 설치를 시작합니다:
```bash
./ArcSight-8.4.0.8955.0-Connector-Linux64.bin
```

### 4. 설치 과정
1. 라이선스 동의
2. 설치 위치 지정: `/opt/connectors/[장비유형]_[포트]_con[번호]`
3. 설치 완료 후 설정 도구 실행:
```bash
cd /opt/connectors/[장비유형]_[포트]_con[번호]/current/bin
./runagentsetup.sh
```

## Syslog Connector 상세 구성

### 1. 기본 설정
- **보안 파라미터 입력 숨김**: `yes` (권장)
  - 비밀번호와 같은 민감한 정보를 화면에 표시하지 않음
- **Generator ID**: 기본값 또는 조직 정책에 따라 설정
- **FIPS 모드**: 조직의 보안 요구사항에 따라 설정 (필요시 활성화)
- **원격 관리**: 보안 강화를 위해 기본적으로 비활성화 권장

### 2. Connector 유형 선택
ArcSight는 다양한 유형의 Connector를 제공하며, Syslog 구성 시:
- 메뉴에서 `Syslog Daemon (125번)` 선택

### 3. Syslog 파라미터 구성
- **네트워크 포트**: 로그 수집용 포트 지정 (예: 41514)
  - 조직 내 포트 할당 정책 준수
  - 다른 서비스와 충돌되지 않는 포트 선택
- **수신 인터페이스**: 
  - 모든 인터페이스: `ALL` 지정
  - 특정 인터페이스: IP 주소 지정 (보안 강화)
- **프로토콜**: 
  - `UDP`: 대량 로그 처리에 적합, 손실 가능성 존재
  - `TCP`: 신뢰성 높음, 성능 저하 가능성 존재
- **포워더 모드**: 일반적으로 `false` (필요시 활성화)

### 4. ESM 연결 구성
- **대상 유형**: `ArcSight Manager (encrypted)` 권장
- **Manager 호스트명**: ESM 서버 FQDN 입력 (예: esm.security.local)
- **Manager 포트**: 기본값 8443 사용
- **인증 정보**: ESM 전용 Connector 계정 사용 (최소 권한 원칙 적용)

### 5. Connector 식별 정보
- **Connector 이름**: 명명 규칙에 따라 식별 가능한 이름 부여
- **위치 정보**: 물리적/논리적 위치 정보 입력
- **주석**: 관리 목적의 추가 정보 기입

### 6. 보안 인증서 구성
- ESM 서버로부터 인증서 가져오기:
  - `Import the certificate to connector from destination` 선택
  - 인증서 지문 확인 후 승인 (중요: 인증서 검증 필수)

### 7. 서비스 등록
- **서비스 내부 이름**: Connector 식별자 (예: app_41514_con1)
- **서비스 표시 이름**: 관리용 표시 이름
- **자동 시작**: `Yes` 선택 (시스템 재부팅 시 자동 실행)

## 보안 강화 설정

### 1. 인증 및 암호화
- **FIPS 140-2 준수**: 정부 및 금융기관 요구사항 충족을 위해 활성화
- **TLS 1.2 이상** 사용 강제
- **강력한 암호화 스위트** 적용:
```bash
# current/user/agent/agent.properties 파일 수정
fips.ssl.provider=BCFIPS
fips.provider.class=org.bouncycastle.jcajce.provider.BouncyCastleFipsProvider
fips.enable=true
```

### 2. 접근 통제
- **최소 권한 원칙** 적용:
  - Connector 실행 계정에 필요한 최소 권한만 부여
  - 설정 파일 권한 제한 (600, 640 권장)
```bash
# 권한 설정 예시
sudo chown -R connector:connector /opt/connectors/app_41514_con1/
sudo chmod 750 /opt/connectors/app_41514_con1/
sudo chmod 640 /opt/connectors/app_41514_con1/current/user/agent/agent.properties
```

### 3. 로그 무결성 보호
- 중요 로그 파일 무결성 모니터링 구성:
```bash
# AIDE 설치 및 구성 예시
sudo yum install -y aide
sudo aide --init
sudo mv /var/lib/aide/aide.db.new.gz /var/lib/aide/aide.db.gz
sudo systemctl enable --now aide-check.timer
```

## 운영 및 관리 베스트 프랙티스

### 1. 명명 규칙 표준화
모든 Connector에 일관된 명명 규칙을 적용하여 식별 및 관리를 용이하게 합니다:
- 설치 경로: `/opt/connectors/[장비유형]_[포트]_con[번호]`
- 서비스명: `[장비유형]_[포트]_con[번호]`
- 로그 파일: `/var/log/connectors/[장비유형]_[포트]_con[번호]/`

### 2. 포트 관리
- **포트 할당 문서화**: 모든 Connector 포트 정보를 중앙 문서에 기록
- **포트 중복 방지**: 신규 Connector 설치 시 기존 포트와 충돌 여부 확인
- **포트 범위 정의**: 장비 유형별 포트 범위 지정 (예: 방화벽 10000-10999, IDS 11000-11999)

### 3. 백업 및 복구 계획
- **정기적 설정 파일 백업**:
```bash
# 백업 스크립트 예시
#!/bin/bash
BACKUP_DIR="/backup/connectors/$(date +%Y%m%d)"
mkdir -p $BACKUP_DIR
for CONN_DIR in /opt/connectors/*; do
  CONN_NAME=$(basename $CONN_DIR)
  tar -czf $BACKUP_DIR/${CONN_NAME}.tar.gz -C $CONN_DIR current/user
done
# 30일 이상 된 백업 삭제
find /backup/connectors/ -type d -mtime +30 -exec rm -rf {} \;
```

- **복구 절차 문서화 및 정기 테스트**:
  - 설정 파일 복원 절차
  - Connector 재설치 절차
  - 장애 시나리오별 대응 방안

### 4. 변경 관리
- **변경 이력 관리**: 모든 구성 변경 사항 기록
- **변경 전 검증**: 중요 변경 사항 적용 전 테스트 환경에서 검증
- **변경 후 검증**: 변경 적용 후 로그 수집 정상 여부 확인

## 성능 최적화

### 1. 시스템 리소스 최적화
- **메모리 할당**:
```bash
# current/user/agent/agent.wrapper.conf 파일 수정
wrapper.java.initmemory=256
wrapper.java.maxmemory=1024
```

- **디스크 I/O 최적화**:
```bash
# 파일시스템 옵션 조정
sudo mount -o remount,noatime,nodiratime /opt
```

### 2. 로그 처리 최적화
- **배치 설정**:
```bash
# current/user/agent/agent.properties 파일 수정
agents[0].maxbatchsize=1000
agents[0].batchsize=500
```

- **캐시 설정**:
```bash
# current/user/agent/agent.properties 파일 수정
agents[0].cachesizekilobytes=100000
```

### 3. 네트워크 최적화
- **DNS 조회 비활성화**:
```bash
# current/user/agent/agent.properties 파일 수정
agents[0].dnsresolution=false
```

- **하트비트 조정**:
```bash
# current/user/agent/agent.properties 파일 수정
agents[0].heartbeatfrequency=30
```

## 문제 해결 가이드

### 1. 연결 문제 해결
- **ESM 연결 실패**:
  1. 네트워크 연결 확인:
     ```bash
     ping [ESM_호스트명]
     telnet [ESM_호스트명] 8443
     ```
  2. 인증서 문제 확인:
     ```bash
     # 인증서 내용 확인
     keytool -list -v -keystore /opt/connectors/[장비유형]_[포트]_con[번호]/current/jre/lib/security/cacerts -storepass changeit
     ```
  3. ESM 서버 상태 확인

- **방화벽 설정 확인**:
  ```bash
  # 서버 측 포트 확인
  sudo netstat -tulpn | grep [포트번호]
  
  # 방화벽 규칙 확인
  sudo firewall-cmd --list-all
  ```

### 2. 로그 수집 문제
- **로그가 수집되지 않는 경우**:
  1. 소스 장비 로그 발생 확인
  2. 네트워크 패킷 캡처로 로그 도달 여부 확인:
     ```bash
     # UDP 41514 포트로 들어오는 패킷 캡처
     sudo tcpdump -i any udp port 41514 -vvv
     ```
  3. Connector 수신 설정 확인
     ```bash
     # agent.properties 파일에서 수신 포트 확인
     grep -i port /opt/connectors/[장비유형]_[포트]_con[번호]/current/user/agent/agent.properties
     ```

### 3. 성능 저하 문제
- **CPU/메모리 사용량 과다**:
  1. 시스템 리소스 모니터링:
     ```bash
     top -c -p $(pgrep -d',' -f ArcSightSmartConnector)
     ```
  2. 힙 메모리 덤프 분석 (심각한 경우):
     ```bash
     jmap -dump:format=b,file=/tmp/connector_heap.hprof $(pgrep -f ArcSightSmartConnector)
     ```
  3. 배치 설정 및 캐시 조정

- **로그 처리 지연**:
  1. 현재 처리 상태 확인:
     ```bash
     tail -f /opt/connectors/[장비유형]_[포트]_con[번호]/current/logs/agent.log | grep -i statistics
     ```
  2. 파서 성능 최적화 (필요시)
  3. 이벤트 필터링 적용으로 처리량 감소

## 부록: 유용한 로그 및 명령어

### 주요 로그 파일 위치
- 에이전트 로그: `/opt/connectors/[장비유형]_[포트]_con[번호]/current/logs/agent.log`
- 출력 로그: `/opt/connectors/[장비유형]_[포트]_con[번호]/current/logs/agent.out.log`
- 오류 로그: `/opt/connectors/[장비유형]_[포트]_con[번호]/current/logs/agent.err.log`

### 관리용 명령어
- **서비스 상태 확인**:
  ```bash
  sudo systemctl status [장비유형]_[포트]_con[번호]
  ```

- **서비스 시작/중지/재시작**:
  ```bash
  sudo systemctl start [장비유형]_[포트]_con[번호]
  sudo systemctl stop [장비유형]_[포트]_con[번호]
  sudo systemctl restart [장비유형]_[포트]_con[번호]
  ```

- **실시간 로그 모니터링**:
  ```bash
  tail -f /opt/connectors/[장비유형]_[포트]_con[번호]/current/logs/agent.log
  ```

- **특정 오류 검색**:
  ```bash
  grep -i error /opt/connectors/[장비유형]_[포트]_con[번호]/current/logs/agent.log
  ```

- **처리 통계 확인**:
  ```bash
  grep -i statistics /opt/connectors/[장비유형]_[포트]_con[번호]/current/logs/agent.log | tail -20
  ```

### 추가 도구
- **로그 분석 스크립트** (daily_stats.sh):
  ```bash
  #!/bin/bash
  # Connector 처리 통계 요약
  CONNECTOR_DIR="/opt/connectors/[장비유형]_[포트]_con[번호]"
  LOG_FILE="$CONNECTOR_DIR/current/logs/agent.log"
  
  echo "=== $(date) - Connector 처리 통계 ==="
  echo "최근 처리 건수:"
  grep -i "events processed" $LOG_FILE | tail -5
  
  echo -e "\n최근 오류 발생:"
  grep -i "error" $LOG_FILE | tail -10
  
  echo -e "\n서비스 상태:"
  systemctl status [장비유형]_[포트]_con[번호] | head -3
  ```

---

> **참고**: 본 문서는 ArcSight Connector v8.4.0.8955.0 기준으로 작성되었으며, 버전에 따라 일부 설정이나 기능이 상이할 수 있습니다. 구체적인 설정은 공식 ArcSight 문서를 참조하십시오.
