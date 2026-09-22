---
layout: default
title: HTTP 버전
nav_order: 7
permalink: /wiki/computer-systems-network-http-6c47fd343b2a/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-http-6c47fd343b2a
projection_sha256: fcf42de7f9771c172ee2a1da9130c160d3f331270c1ba6e55e63994576e8252b
parent: HTTP
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-http-2fe226962c51
grand_parent: 네트워크
ancestor: CS 기초
---

# HTTP 버전
{: .no_toc }

HTTP 버전이 달라져도 자원에 동작을 요청하고 결과를 응답한다는 기본 의미는 이어진다. 주요 차이는 메시지를 어떻게 나누어 전송하는지, 연결을 재사용하는지, 여러 요청이 서로 얼마나 기다려야 하는지에 있다.

| 버전 | 전송 구조의 특징 |
| --- | --- |
| HTTP/1.0 | 텍스트 시작 줄과 Header. 기본적인 흐름은 응답 뒤 연결 종료 |
| HTTP/1.1 | 기본 연결 재사용, Chunked 전송과 Pipelining 등 |
| HTTP/2 | TCP 위의 Binary Frame, 여러 Stream의 다중화, HPACK |
| HTTP/3 | QUIC 위의 Stream, QPACK |

## 연결을 재사용하는 HTTP/1.1

요청마다 TCP 연결을 새로 만들면 Handshake 비용이 반복된다. HTTP/1.1은 기본적으로 Persistent Connection을 사용해 같은 연결에서 여러 요청과 응답을 처리할 수 있다. `Connection: keep-alive` Header가 있어야만 가능한 동작은 아니다. [HTTP/1.1의 연결 유지](https://www.rfc-editor.org/rfc/rfc9112.html#section-9.3)

연결을 재사용하려면 앞선 메시지가 어디에서 끝나는지 알아야 한다. 본문이 있는 응답에서 길이를 정확히 처리하지 못하면 다음 응답의 시작을 구분할 수 없다. Content-Length와 Chunked 전송 같은 Framing 규칙이 연결 관리와 이어지는 이유다.

HTTP/1.1의 Pipelining은 앞선 응답을 다 받기 전에 다음 요청을 보낼 수 있게 하지만, 응답은 요청 순서에 맞춰 보내야 한다. 앞 요청의 처리가 늦어지면 뒤 응답도 기다릴 수 있다. 이런 앞선 작업에 의한 대기를 Head-of-Line Blocking이라고 한다.

HTTP/1.0에서도 연결 유지를 위한 확장이 사용되었다. 따라서 버전 이름만 보고 실제 연결이 항상 닫힌다고 단정하기보다 메시지와 구현이 사용하는 규칙을 확인해야 한다.

브라우저는 한 출처에 여러 TCP 연결을 열어 요청을 나누어 보내기도 한다. 이때 출처는 Scheme·Host·Port의 조합이다. 연결 수의 한도는 브라우저와 환경에 따라 달라지며, 특정 숫자가 HTTP의 고정 규칙은 아니다. 연결을 늘리면 병렬성은 얻지만 소켓·메모리·혼잡 제어 상태와 연결 초기화 비용도 늘어난다. TLS 버전, 연결 재개와 네트워크 조건이 다르므로 이 비용을 언제나 일정한 RTT로 계산할 수는 없다.

파일을 합치는 Bundling, 이미지를 붙이는 Sprite, 여러 도메인으로 연결을 나누는 Domain Sharding은 이런 환경에서 쓰인 최적화다. HTTP/2로 바뀌면 요청 수만 줄이는 것보다 캐시 재사용, 초기 다운로드 크기와 실제 연결 수를 함께 평가해야 한다. 파일을 무조건 하나로 합치거나 도메인을 많이 나누는 것이 항상 빠르지는 않다.

## TCP 위에서 Stream을 나누는 HTTP/2

HTTP/2는 요청·응답을 Binary Frame으로 나누고 하나의 연결에서 여러 Stream을 다중화한다. HTTP/1.1의 응답 순서를 그대로 기다리는 방식과 달리, 서로 다른 Stream의 Frame을 섞어 전송할 수 있다. Header 압축에는 HPACK을 사용한다. [HTTP/2 규격](https://www.rfc-editor.org/rfc/rfc9113.html)

다만 전송 계층은 [TCP](/wiki/computer-systems-network-tcp-a7f7f386cd75/)다. TCP에서 앞선 Byte가 유실되어 뒤 Byte의 전달이 지연되면 여러 HTTP Stream이 영향을 받을 수 있다. HTTP 계층에서 Stream을 나누는 것과 TCP의 순서 있는 Byte 전달은 서로 다른 계층의 동작이다.

HTTP/2에서는 HTTP/1.x의 요청 라인과 상태 라인을 그대로 전송하지 않는다. `:method`, `:path`, `:status` 같은 Pseudo-header와 Frame을 사용한다. 개발자 도구가 사람이 읽기 편하게 표시하는 HTTP 정보와 실제 전송 Byte 형식을 구분해서 보아야 한다.

### Frame과 Stream ID

HTTP/2 Frame은 고정된 9 Byte Header와 가변 길이 Payload로 구성된다. Frame 전체의 길이가 고정된 것은 아니다.

| 필드 | 크기와 의미 |
| --- | --- |
| Length | 24 Bit. Header를 제외한 Payload 길이 |
| Type | 8 Bit. Frame 종류 |
| Flags | 8 Bit. 해당 종류에 적용되는 표시 |
| Reserved | 1 Bit. 송신할 때 0으로 두는 예약 Bit |
| Stream ID | 31 Bit. Frame이 속한 Stream, 0은 연결 전체에 관한 Frame |

기본 최대 Payload는 16,384 Byte다. 수신자가 `SETTINGS_MAX_FRAME_SIZE`로 더 큰 값을 알리면 송신자는 그 한도에 맞춰 보낼 수 있다. 허용되는 상한은 16,777,215 Byte이며 Frame 종류에 따른 추가 제한도 있다. 양쪽이 항상 같은 최대 크기로 합의해야 한다는 뜻은 아니다. [Frame 크기 규칙](https://www.rfc-editor.org/rfc/rfc9113.html#section-4.2)

클라이언트가 시작하는 Stream ID는 홀수, 서버가 시작하는 Stream ID는 짝수다. 서버가 보내는 응답도 클라이언트가 시작한 요청의 Stream을 사용하므로, 서버 응답의 ID가 항상 짝수인 것은 아니다. 짝수 Stream은 서버가 시작하는 Push와 연결된다.

| Frame | 역할 |
| --- | --- |
| HEADERS (`0x1`) | 압축한 HTTP 필드와 필요한 Stream 정보 |
| DATA (`0x0`) | 요청이나 응답의 본문 |
| SETTINGS (`0x4`) | 수신 한도 등 연결에 적용할 설정 |
| WINDOW_UPDATE (`0x8`) | 추가로 받을 수 있는 DATA 양을 알리는 흐름 제어 |
| RST_STREAM (`0x3`) | 특정 Stream 종료 |
| GOAWAY (`0x7`) | 새 Stream 수락 중단과 연결 종료에 관한 정보 |
| PING (`0x6`) | 연결 응답 확인과 왕복 시간 측정 |

하나의 메시지에는 HEADERS와 필요한 DATA가 이어진다. 큰 필드 블록은 CONTINUATION Frame으로 이어질 수 있고, 본문이 없는 메시지는 DATA 없이 끝날 수도 있다. 연결에 관한 Frame과 개별 Stream의 Frame을 구분해 읽어야 한다.

### 섞여 도착한 본문을 다시 모으기

큰 이미지의 Stream 1과 작은 CSS의 Stream 3을 생각해 보자. 이미지의 첫 조각 다음에 CSS 전체를 보낸 뒤 나머지 이미지 조각을 보내면, 늦게 요청한 CSS의 본문 수신이 먼저 끝날 수 있다. 각 Frame의 Stream ID로 조각을 모으기 때문이다.

아래 코드는 이 구조를 Byte 배열로 만든 뒤 직접 읽는다. 이미 열린 Stream의 DATA Frame을 비교하는 예제이며, HTTP/2 연결 수립이나 HPACK까지 구현한 클라이언트는 아니다.

```run-python
def data_frame(stream_id, payload, *, end=False):
    if not 0 < stream_id < 2**31 or len(payload) > 16384:
        raise ValueError("Stream ID와 예제의 Frame 크기 범위를 확인한다.")
    return (len(payload).to_bytes(3, "big")
            + bytes([0, int(end)])
            + stream_id.to_bytes(4, "big") + payload)


preface = b"PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n"
print(f"클라이언트 서문의 고정 문자열: {len(preface)} Byte")
print(preface.hex(" "))

# 이미 열린 Stream 1과 3의 DATA Frame만 비교한다.
wire = (data_frame(1, b"ABC")
        + data_frame(3, b"css", end=True)
        + data_frame(1, b"DEF", end=True))
offset = 0
contents = {}
finished = []
while offset < len(wire):
    if len(wire) - offset < 9:
        raise ValueError("Frame Header가 아직 완성되지 않았다.")
    header = wire[offset:offset + 9]
    length = int.from_bytes(header[:3], "big")
    frame_type, flags = header[3], header[4]
    stream_id = int.from_bytes(header[5:9], "big") & 0x7fffffff
    stop = offset + 9 + length
    if stop > len(wire):
        raise ValueError("Payload가 아직 완성되지 않았다.")
    if frame_type != 0 or stream_id == 0 or flags & ~1:
        raise ValueError("예제는 Padding 없는 DATA Frame만 처리한다.")
    payload = wire[offset + 9:stop]
    if stream_id in finished:
        raise ValueError("이미 송신을 마친 Stream에 DATA가 다시 왔다.")
    contents.setdefault(stream_id, bytearray()).extend(payload)
    print(f"Stream {stream_id}: {length} Byte, END_STREAM={bool(flags & 1)}")
    if flags & 1:
        finished.append(stream_id)
    offset = stop

print("본문 수신 완료 순서:", finished)
for stream_id, body in sorted(contents.items()):
    print(f"Stream {stream_id} 본문: {body.decode('ascii')}")
```

실행하면 본문은 Stream 1의 `ABCDEF`, Stream 3의 `css`로 복원되고 완료 순서는 `[3, 1]`이 된다. `Length`로 다음 Frame의 시작 위치를 찾고 Stream ID로 본문을 나누는 과정을 볼 수 있다. `ABC`를 다른 Byte 문자열로 바꾸면 생성된 Length와 복원 결과도 달라진다.

코드 앞부분의 24 Byte 고정 문자열은 클라이언트 Connection Preface의 일부다. 실제 연결에서는 그 뒤에 SETTINGS가 오고, 서버의 Preface는 SETTINGS로 시작한다. 코드가 만든 DATA 배열을 이 문자열 뒤에 붙이기만 하면 유효한 HTTP/2 연결이 되는 것은 아니다. [연결 서문](https://www.rfc-editor.org/rfc/rfc9113.html#section-3.4)

### HPACK과 반복되는 Header

요청마다 `User-Agent`, `Accept`, `Cookie` 같은 필드를 반복해서 보내면 같은 문자열이 전송량을 차지한다. HPACK은 필드의 이름과 값을 인덱스로 참조하거나 문자열로 인코딩해 이 중복을 줄인다.

정적 테이블에는 미리 정한 61개 항목이 있다. 예를 들어 인덱스 2는 `:method: GET`을 나타낸다. 동적 테이블에는 연결의 각 전송 방향에서 공유하는 항목을 추가하고 다시 참조할 수 있다. 모든 필드를 반드시 테이블에 넣는 것은 아니며, 테이블 크기와 항목 제거 규칙도 따른다.

문자열은 원래 Byte로 보내거나 정해진 Huffman Code로 인코딩할 수 있다. Huffman 인코딩이 항상 의무인 것은 아니다. HPACK이 줄이는 대상은 HTTP 필드이며, 이미지나 JSON 본문을 압축하는 기능과 구분된다. [HPACK 규격](https://www.rfc-editor.org/rfc/rfc7541.html)

### Server Push의 지원 범위

HTTP/2에는 서버가 클라이언트의 추가 요청을 기다리지 않고 자원을 보내는 Server Push가 정의되어 있다. PUSH_PROMISE로 앞으로 보낼 자원과 Stream을 알린 뒤 그 Stream으로 응답을 보낸다. 클라이언트가 이미 캐시한 파일을 다시 보내면 낭비가 될 수 있다.

Chrome은 106부터 Server Push를 기본 비활성화했다. 실무 적용 여부를 판단할 때는 규격에 기능이 있다는 사실과 사용하는 브라우저·서버의 지원을 나누어 확인해야 한다. `103 Early Hints`와 `preload`는 필요한 자원의 힌트를 알리고 브라우저가 요청 여부를 결정하게 하는 방법이다. [Chrome의 변경 안내](https://developer.chrome.com/blog/removing-push)

## QUIC을 사용하는 HTTP/3

HTTP/3는 UDP 기반 QUIC 위에서 동작한다. QUIC은 신뢰성 있는 Stream, 흐름 제어와 혼잡 제어 등을 제공하며, HTTP/3의 Header 압축에는 QPACK을 사용한다. UDP 자체에 이 기능이 모두 들어 있다는 뜻은 아니다. [HTTP/3 규격](https://www.rfc-editor.org/rfc/rfc9114.html)

QUIC은 서로 다른 Stream의 데이터 전달을 나눌 수 있어 한 Stream의 손실 때문에 다른 Stream까지 TCP의 같은 순서 대기를 겪는 문제를 줄인다. 그렇다고 Stream들이 모든 면에서 완전히 독립적인 것은 아니다. 같은 연결의 혼잡 제어나 공유 자원의 영향을 받을 수 있다.

HTTP/3를 사용하려면 클라이언트·서버와 중간 네트워크가 필요한 통신을 지원해야 한다. 지원 환경이나 연결 조건이 다르면 다른 HTTP 버전을 사용할 수 있으므로, 사이트가 어떤 버전을 사용했다고 말할 때는 실제 연결에서 확인한 결과를 기준으로 한다.

## 실제 연결에서 버전 확인하기

HTTPS에서 HTTP/2를 사용할 때는 TLS Handshake의 ALPN으로 `h2`를 선택한다. HTTP 의미는 유지되지만 클라이언트에서 CDN·Proxy까지의 연결과 Proxy에서 원본 서버까지의 연결은 서로 다른 버전일 수 있다. 브라우저가 HTTP/2를 사용한다고 해서 백엔드 연결도 자동으로 HTTP/2가 되지는 않는다.

TLS 없이 시작하는 HTTP/2도 규격에 있다. 다만 예전에 사용하던 `Upgrade: h2c` 방식은 RFC 9113에서 폐기되었으므로 오래된 설정 예제를 그대로 따라서는 안 된다. [HTTP/2 시작 방식](https://www.rfc-editor.org/rfc/rfc9113.html#section-3)

curl과 외부 네트워크에 접근할 수 있는 터미널에서 다음 명령을 실행한다.

```bash
curl --max-time 12 -v --http2 https://docs.woonyong.com/wiki/home/ -o /dev/null
```

`curl --version`의 Features에 HTTP2가 있는 환경에서 실행한다. `--http2`는 HTTP/2 사용을 요청하는 옵션이며 결과까지 보장하지는 않는다. `-v` 출력에서 ALPN 선택과 `using HTTP/2`, 응답의 버전을 확인한다. 연결 조건에 따라 다른 버전으로 응답하거나 요청이 실패할 수 있다. 터미널에 보이는 `GET ... HTTP/2`는 curl이 해석해 표시한 내용이며, 실제 전송된 텍스트 요청 라인은 아니다.

nginx 1.25.1 이상에서 HTTP/2 모듈과 TLS가 준비되어 있다면 다음처럼 설정할 수 있다. 인증서 경로는 실제 배포 환경에 맞춰 지정한다.

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name example.com;
    ssl_certificate     /etc/ssl/example.crt;
    ssl_certificate_key /etc/ssl/example.key;
}
```

이 설정은 브라우저가 접속하는 가상 서버의 HTTP/2를 켠다. 다른 서버 제품의 설정이나 업스트림 통신까지 같은 방식으로 바뀌는 것은 아니다. 모듈 지원과 TLS의 ALPN 조건은 [nginx HTTP/2 문서](https://nginx.org/en/docs/http/ngx_http_v2_module.html)를 확인한다.
