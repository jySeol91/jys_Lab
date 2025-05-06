
# 2023 CCE 훈련장 Web 문제 - BabyWeb [100점]

> 작성자: 보안 리서처  
> 주제: 웹 해킹 기초 분석 및 필터 우회  
> 난이도: 입문 ~ 초급

---

## 개요

2023 CCE 훈련장에서 출제된 Web 문제 중 하나인 `BabyWeb`을 분석해 보았다. 문제를 풀고 나서 확인해보니, 이 문제는 사실 2022년도 문제이기도 했다.

당시에는 주로 포렌식 분야에 집중하고 있었기 때문에 기억이 나지 않았던 것으로 보인다. 이번에는 웹 해킹 문제에 적응하기 위해 해당 문제를 분석하고 풀이 과정을 정리하였다.

---

## 문제 페이지 확인

처음 접속하면 입력창과 제출 버튼만 존재하는 간단한 UI를 확인할 수 있다.

![문제 화면](https://security-project.gitbook.io/~gitbook/image?url=https%3A%2F%2F195450949-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252FwXebIV03JyHoFhrHQiSC%252Fuploads%252FNSdHpx71TlQ2xvo3lXWg%252Fimage.png)

Burp Suite를 통해 요청을 분석해 보아도 별다른 취약점이나 정보는 노출되지 않았다.

![Burp 분석](https://security-project.gitbook.io/~gitbook/image?url=https%3A%2F%2F195450949-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252FwXebIV03JyHoFhrHQiSC%252Fuploads%252FuCAmNwX0Xk9nOIce8xtZ%252Fimage.png)

---

## 제공된 파일 분석

문제와 함께 압축 파일이 제공되며, 압축 해제 시 아래와 같은 구조를 가진다.

- `public/`
- `internal/`
- 주요 관심 파일: `app.py`, `secret.py`

![파일 구조](https://security-project.gitbook.io/~gitbook/image?url=https%3A%2F%2F195450949-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252FwXebIV03JyHoFhrHQiSC%252Fuploads%252FoGQjdxKs4DHLdDCiVzWa%252Fimage.png)

---

## 코드 분석

### app.py

다양한 라이브러리가 import 되어 있으며, 그중 `urllib`, `ipaddress`, `requests` 등이 눈에 띈다.

```python
result = urllib.parse.urlparse(url)
if result.hostname == 'flag.service':
    return "Not allow"
```

이 부분은 `flag.service`라는 hostname이 입력되었을 경우 명시적으로 차단하고 있다. 그러나 의심의 여지는 남아 있다.

추가적으로 유효한 IP 주소인지 검사하고 특정 조건이 맞지 않으면 `"huh??"` 혹은 `"Something wrong..."`이라는 메시지를 출력한다.

```python
if(valid_ip(result.hostname)):
    return "huh??"
...
return requests.get("http://"+result.hostname+result.path).text
```

즉, `flag.service`로의 접근은 차단하고 있으나, 우회할 수 있는 여지는 존재한다.

---

### secret.py

해당 파일 내에 flag가 저장되어 있는 것으로 확인된다.

![secret.py](https://security-project.gitbook.io/~gitbook/image?url=https%3A%2F%2F195450949-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252FwXebIV03JyHoFhrHQiSC%252Fuploads%252Fdgp8h60siYUHa6zr1RqX%252Fimage.png)

---

## 취약점 및 우회 방법

### 분석 포인트

- `urlparse()`의 결과로 나오는 `hostname`만 필터링하고 있음
- 그러나 사용자 입력은 URL 전체이므로, Encoding 기법을 통해 필터를 우회할 수 있다

### 해결 방법

```http
http://%66lag.service/
```

위처럼 `flag.service`를 HTML URL 인코딩하여 우회하면 정상적으로 요청이 처리되어 flag 값을 확인할 수 있다.

![플래그 확인](https://security-project.gitbook.io/~gitbook/image?url=https%3A%2F%2F195450949-files.gitbook.io%2F%7E%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252FwXebIV03JyHoFhrHQiSC%252Fuploads%252Fqsp91RqY3fFVrxH7FHEK...)

---

## 결론

- `urlparse()` 결과 중 `hostname` 필드만 필터링할 경우, HTML 인코딩 등의 기법으로 쉽게 우회 가능하다.
- 단순한 필터링은 보안 우회를 막기엔 불충분하며, 전체 요청의 구조와 context-aware 분석이 필요하다.

> ✍️ 보안 담당자나 시스템 개발자는 외부 입력에 대한 **정규화(Normalization)** 및 **정책 기반 필터링**을 병행할 필요가 있다.

---

## 추천 개선 사항

- `hostname` 필터링만 하지 말고, 입력 URL에 대해 정규화된 전체 경로 기반 필터링 적용
- 내부 서비스 접근 차단은 서버 측 방화벽 또는 리버스 프록시를 활용한 IP 제한으로 보완
- 공격자 우회 경로 예외 처리 및 로깅 강화

---

## 플래그 획득 방식 요약

1. 문제 UI는 단순하지만 내부에서 URL을 요청하여 응답을 출력하는 구조
2. `flag.service`라는 도메인 접근이 차단됨
3. `%66lag.service` (URL 인코딩) 방식으로 필터 우회 성공
4. 내부적으로 해당 도메인에 접근, 응답으로부터 flag 추출 성공

---

**참고:**
- URL 인코딩 우회 공격
- SSRF 필터링 우회 기법
