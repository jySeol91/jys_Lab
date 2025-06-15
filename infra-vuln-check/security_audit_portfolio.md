# Linux/Unix 보안 점검 스크립트

## 프로젝트 개요

정보시스템 취약점 점검기준에 따른 Linux/Unix 시스템 보안 점검 자동화 스크립트입니다. 다양한 운영체제 환경에서 보안 설정 상태를 점검하고 취약점을 식별하여 보안 강화 방안을 제시합니다.

## 주요 특징

- **다중 OS 지원**: CentOS/RHEL 6.x, 7.x, Rocky Linux 9.x, SunOS 5.10
- **자동화된 보안 점검**: 71개 보안 항목 자동 검사
- **우선순위 기반 분류**: 중요도별(상/중/하) 취약점 분류
- **상세 보고서 생성**: 점검 결과 리포트 자동 생성
- **실시간 점검**: 현재 시스템 상태 실시간 분석

## 기술 스택

- **Language**: Bash Shell Script
- **OS Support**: Linux (RHEL/CentOS/Rocky), Solaris
- **Tools**: systemctl, chkconfig, svcs, stat, awk, grep

## 점검 항목 분류

### 1. 계정 관리 (15개 항목)

| 항목코드 | 점검항목 | 중요도 |
|---------|---------|--------|
| U-01 | root 계정 원격 접속 제한 | 상 |
| U-02 | 패스워드 복잡성 설정 | 상 |
| U-03 | 계정 잠금 임계값 설정 | 상 |
| U-04 | 패스워드 파일 보호 | 상 |
| U-44 | root 이외의 UID가 '0' 금지 | 중 |
| U-45 | root 계정 su 제한 | 하 |
| U-46 | 패스워드 최소 길이 설정 | 중 |
| U-47 | 패스워드 최대 사용기간 설정 | 중 |
| U-48 | 패스워드 최소 사용기간 설정 | 중 |
| U-49 | 불필요한 계정 제거 | 하 |
| U-50 | 관리자 그룹에 최소한의 계정 포함 | 하 |
| U-51 | 계정이 존재하지 않는 GID 금지 | 하 |
| U-52 | 동일한 UID 금지 | 중 |
| U-53 | 사용자 shell 점검 | 하 |
| U-54 | Session Timeout 설정 | 하 |

### 3. 서비스 관리 (33개 항목)

| 항목코드 | 점검항목 | 중요도 |
|---------|---------|--------|
| U-19 | finger 서비스 비활성화 | 상 |
| U-20 | Anonymous FTP 비활성화 | 상 |
| U-21 | r 계열 서비스 비활성화 | 상 |
| U-22 | cron 파일 소유자 및 권한설정 | 상 |
| U-23 | DoS 공격에 취약한 서비스 비활성화 | 상 |
| U-24 | NFS 서비스 비활성화 | 상 |
| U-25 | NFS 접근 통제 | 상 |
| U-26 | automountd 제거 | 상 |
| U-27 | RPC 서비스 확인 | 상 |
| U-28 | NIS, NIS+ 점검 | 상 |
| U-29 | tftp, talk 서비스 비활성화 | 상 |
| U-30 | Sendmail 버전 점검 | 상 |
| U-31 | 스팸 메일 릴레이 제한 | 상 |
| U-32 | 일반사용자의 Sendmail 실행 방지 | 상 |
| U-33 | DNS 보안 버전 패치 | 상 |
| U-34 | DNS Zone Transfer 설정 | 상 |
| U-35 | 웹서비스 디렉토리 리스팅 제거 | 상 |
| U-36 | 웹서비스 웹 프로세스 권한 제한 | 상 |
| U-37 | 웹서비스 상위 디렉토리 접근 금지 | 상 |
| U-38 | 웹서비스 불필요한 파일 제거 | 상 |
| U-39 | 웹서비스 링크 사용 금지 | 상 |
| U-40 | 웹서비스 파일 업로드 및 다운로드 제한 | 상 |
| U-41 | 웹서비스 영역의 분리 | 상 |
| U-60 | ssh 원격접속 허용 | 중 |
| U-61 | ftp 서비스 확인 | 하 |
| U-62 | ftp 계정 shell 제한 | 중 |
| U-63 | Ftpusers 파일 소유자 및 권한 설정 | 하 |
| U-64 | Ftpusers 파일 설정 | 중 |
| U-65 | at 파일 소유자 및 권한 설정 | 중 |
| U-66 | SNMP 서비스 구동 점검 | 중 |
| U-67 | SNMP 서비스 커뮤니티스트링의 복잡성 설정 | 중 |
| U-68 | 로그온 시 경고 메시지 제공 | 하 |
| U-69 | NFS 설정파일 접근 제한 | 중 |
| U-70 | expn, vrfy 명령어 제한 | 중 |
| U-71 | Apache 웹 서비스 정보 숨김 | 중 |

## 핵심 기능

### 1. 운영체제 자동 감지
```bash
detect_os() {
    if [ -f /etc/redhat-release ]; then
        OS_VERSION=$(cat /etc/redhat-release)
        if echo "$OS_VERSION" | grep -q "CentOS.*6\|Red Hat.*6"; then
            OS_TYPE="RHEL6"
        elif echo "$OS_VERSION" | grep -q "CentOS.*7\|Red Hat.*7"; then
            OS_TYPE="RHEL7"
        elif echo "$OS_VERSION" | grep -q "Rocky.*9"; then
            OS_TYPE="ROCKY9"
        fi
    elif uname -s | grep -q "SunOS"; then
        OS_TYPE="SUNOS"
    fi
}
```

### 2. 서비스 상태 점검
```bash
check_service_disabled() {
    local service="$1"
    local importance="$2"
    
    case "$OS_TYPE" in
        "RHEL6")
            if chkconfig --list "$service" 2>/dev/null | grep -q ":on"; then
                check_result "WARN" "($service 활성화됨)" "$importance"
            else
                check_result "OK" "" "$importance"
            fi
            ;;
        "RHEL7"|"ROCKY9")
            if systemctl is-enabled "$service" &>/dev/null; then
                check_result "WARN" "($service 활성화됨)" "$importance"
            else
                check_result "OK" "" "$importance"
            fi
            ;;
    esac
}
```

### 3. 결과 분석 및 통계
```bash
check_result() {
    local result="$1"
    local message="$2"
    local importance="$3"
    
    if [ "$result" == "OK" ]; then
        echo "양호"
        ((OK_COUNT++))
    else
        echo "확인 필요 $message"
        ((WARN_COUNT++))
        case "$importance" in
            "상") ((HIGH_COUNT++)) ;;
            "중") ((MID_COUNT++)) ;;
            "하") ((LOW_COUNT++)) ;;
        esac
    fi
}
```

## 실행 결과 예시

```
=== Linux/Unix 보안 점검 스크립트 ===
OS 타입: RHEL7
점검 시간: 2024-01-15 14:30:25

== 1. 계정 관리 점검 ==
[U-01] root 계정 원격 접속 제한: 양호
[U-02] 패스워드 복잡성 설정: 확인 필요 (minlen 설정 확인 필요)
[U-03] 계정 잠금 임계값 설정: 양호
...

=== 점검 결과 요약 ===
총 점검 항목: 48 건
양호: 35 건
확인 필요: 13 건

중요도별 확인 필요 현황:
- 상(High): 3 건
- 중(Medium): 6 건
- 하(Low): 4 건
```

## 사용법

### 기본 실행
```bash
chmod +x enhanced_secu_script.sh
./enhanced_secu_script.sh
```

### 상세 보고서 생성
```bash
./enhanced_secu_script.sh --report
```

## 주요 점검 영역

### 계정 보안
- root 계정 원격 접속 제한
- 패스워드 정책 설정
- 계정 잠금 정책
- 불필요한 계정 관리

### 서비스 보안
- 불필요한 서비스 비활성화
- 네트워크 서비스 보안 설정
- 웹 서비스 보안 강화
- 메일 서비스 보안 설정

### 파일 및 권한
- 중요 파일 권한 설정
- 설정 파일 접근 제한
- 로그 파일 보호

## 기대 효과

1. **자동화된 보안 점검**: 수동 점검 시간 90% 단축
2. **표준화된 보안 기준**: 일관된 보안 정책 적용
3. **위험도 기반 우선순위**: 효율적인 보안 강화 작업
4. **정기 점검 지원**: 지속적인 보안 상태 모니터링

## 학습 포인트

- **Shell Scripting**: 고급 Bash 스크립팅 기법
- **시스템 관리**: Linux/Unix 시스템 보안 설정
- **자동화**: 반복 작업의 스크립트 자동화
- **보안 기준**: 정보보안 점검 기준 이해

## 향후 개선 계획

- [ ] 추가 OS 지원 (Ubuntu, Debian 등)
- [ ] JSON/XML 형태 보고서 출력
- [ ] 웹 인터페이스 개발
- [ ] 자동 보안 설정 기능 추가
- [ ] 원격 다중 서버 점검 기능

---
