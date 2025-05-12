# 2024 Pico CTF 문제 풀이

## 1. 문제 2: "Scan Surprise"

### 문제 설명  
이 문제는 특정 파일을 다운로드한 후, 압축을 해제하여 QR 코드 이미지를 분석하는 간단한 문제였다.  
<p align="center"><img src="./images/apk_download.png" width="600"/></p>

### 풀이 과정

1. **파일 다운로드**  
   문제에서 제공된 파일을 다운로드하였다.  
   <p align="center"><img src="./images/qp1.png" width="600"/></p>

2. **압축 해제 후 QR 코드 확인**  
   다운로드한 파일을 압축 해제하면 QR 코드 형태의 이미지 파일이 존재한다.  
   <p align="center"><img src="./images/qp2.png" width="600"/></p>

3. **QR 코드 디코딩**  
   QR 코드 이미지를 `QR Decode` 같은 온라인 툴을 사용하여 디코딩하면 플래그를 확인할 수 있다.  
   <p align="center"><img src="./images/qp3.png" width="600"/></p>

### 결론 및 통찰  
비교적 쉬운 난이도의 문제로, 디코딩 도구만 있으면 빠르게 해결할 수 있었다.  
CTF 문제 풀이에서 파일을 열어 직접 확인해보는 **기초적인 접근법의 중요성**을 다시 한 번 느낄 수 있었다.

---

### 해결 방법

1. QR 코드 이미지 다운로드  
2. [https://qrcoderaptor.com/](https://zxing.org/w/decode.jspx) 등의 사이트에서 이미지 업로드  
3. 디코딩된 텍스트에서 플래그 확인
