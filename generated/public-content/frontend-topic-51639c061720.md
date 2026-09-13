---
layout: default
title: 이미지 최적화
nav_order: 6
permalink: /wiki/frontend-topic-51639c061720/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/frontend-topic-51639c061720
projection_sha256: f55ac232620aa29b9bb670d11c03dd83d4f6ea56b37c02c039e6fdb28eae12ea
parent: 웹 성능
content_status: ready
public_parent_id: Wiki/keywords/frontend-topic-88f740e8afd2
grand_parent: Frontend
---

# 이미지 최적화
{: .no_toc }

이미지를 줄일 때는 파일 크기와 함께 무엇을 보존해야 하는지 정한다. 사진의 미세한 질감을 조금 줄일 수 있는지, 글자 경계가 선명해야 하는지, 반투명 배경이나 여러 프레임이 필요한지에 따라 선택이 달라진다. 같은 확장자라도 해상도·인코더·품질 설정이 다르면 결과가 달라지므로 포맷만으로 용량 비율을 단정하지 않는다.

## JPEG는 어느 단계에서 정보를 줄이는가

웹에서 흔히 쓰는 DCT 기반 JPEG는 이미지의 성분을 8×8 블록으로 나누고, 각 블록을 주파수 성분으로 변환한다. 이어서 계수를 양자화해 정밀도를 줄이고 남은 값을 부호화한다. DCT 변환 자체와 양자화에 의한 손실은 구분해야 한다. 색차 성분을 낮은 해상도로 저장하는 Chroma Subsampling도 별도의 손실 원인이 될 수 있다.

품질을 많이 낮추면 글자 주변이나 선명한 경계에 번짐과 블록 모양이 드러날 수 있다. 이미 손실된 결과를 디코딩해 다시 손실 압축하면 오차가 누적될 수 있으므로 편집용 원본과 배포용 파일을 나누어 보관한다. 파일을 그대로 복사하는 일은 재인코딩이 아니다.

JPEG 표준에는 무손실 방식도 있다. 여기서 비교하는 대상은 일반적인 손실 JPEG이며, 모든 JPEG 계열에 같은 제한을 적용하지 않는다. 보통의 웹 JPEG에는 Alpha Channel과 다중 프레임 애니메이션이 없다. 투명 이미지를 내보낼 때 합성되는 배경색은 편집기와 내보내기 설정이 정하므로 항상 흰색이 되는 것은 아니다. [JPEG 1의 코딩 방식](https://jpeg.org/jpeg/)

## PNG와 GIF의 무손실은 보존 대상이 다르다

PNG는 행 단위 바이트에 필터를 적용한 뒤 DEFLATE로 압축한다. 필터는 앞쪽이나 이전 행의 값과 관계를 이용해 압축하기 좋은 표현을 만들며, 역변환으로 입력을 복원할 수 있다. 무손실이라는 말은 인코딩에 넣은 이미지 샘플을 보존한다는 뜻이다. 저장 도구가 색을 변환하거나 메타데이터를 제거했다면 이전 파일 전체가 그대로 보존되지는 않는다.

PNG는 회색조·팔레트·Truecolor를 지원한다. RGB 각 8비트에 Alpha 8비트를 더한 RGBA 32비트가 한 예이며, Truecolor와 Alpha에 각각 16비트 샘플을 쓰는 구성도 있다. Alpha가 8비트일 때 0은 완전 투명, 255는 완전 불투명이다. PNG 3판에는 APNG 애니메이션도 포함되어 있으므로 PNG는 무조건 정지 이미지만 담는다는 설명은 맞지 않는다. [PNG 3판 명세](https://www.w3.org/TR/png-3/)

GIF는 픽셀의 색을 Color Table의 인덱스로 나타내고 이를 LZW로 압축한다. 한 Color Table은 최대 256색이며, 프레임마다 별도의 Table을 쓸 수 있다. 따라서 애니메이션 파일 전체에 등장하는 색이 반드시 256개 이하인 것은 아니다. 원본 사진을 팔레트로 줄일 때 이미 색을 잃을 수 있으므로 LZW가 무손실이라는 사실만으로 원본 사진까지 보존된다고 볼 수 없다.

GIF89a는 프레임에 표시 지연 시간을 주고, 화면에 남기거나 이전 상태로 되돌리는 처리 방식을 지정할 수 있다. 투명하게 취급할 팔레트 인덱스 하나도 지정할 수 있지만 PNG처럼 픽셀마다 반투명 정도를 표현하지는 못한다. 이를 Alpha Channel 1비트를 저장하는 구조와 혼동하지 않는다. [GIF89a 명세](https://www.w3.org/Graphics/GIF/spec-gif89a.txt)

## 이미지의 성격에 맞춰 비교한다

| 필요한 특성 | 비교할 포맷 | 확인할 부분 |
|---|---|---|
| 사진의 크기 줄이기 | JPEG, 손실 WebP | 같은 해상도에서 질감·경계·용량을 함께 비교한다. |
| 글자·도형의 경계 보존 | PNG, 무손실 WebP | 디코딩한 이미지가 입력과 같은지, 메타데이터가 필요한지 확인한다. |
| 반투명 배경 | PNG, WebP | 실제 배경에 합성했을 때 가장자리도 자연스러운지 본다. |
| 짧은 애니메이션 | GIF, APNG, WebP | 색·Alpha·프레임 수와 대상 환경의 재생을 확인한다. |

WebP는 손실·무손실 압축과 Alpha, 애니메이션을 지원한다. 여러 기능을 담을 수 있다는 사실이 모든 이미지에서 가장 작은 파일을 만든다는 뜻은 아니다. 실제 배포 크기로 인코딩한 결과를 비교해야 한다. [WebP Container 명세](https://developers.google.com/speed/webp/docs/riff_container)

## Signature는 형식의 단서다

확장자는 바꿀 수 있으므로 파일 내용도 확인해야 한다. 다음 예제는 앞부분의 Signature만 비교한다. 정상 이미지를 디코딩하거나 업로드 안전성을 판정하는 코드가 아니다.

```run-python
def signature_hint(header):
    if header.startswith(b"\xff\xd8"):
        return "JPEG"
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "PNG"
    if header.startswith((b"GIF87a", b"GIF89a")):
        return "GIF"
    return "Unknown"

samples = [
    ("JPEG prefix", b"\xff\xd8", "JPEG"),
    ("PNG prefix", b"\x89PNG\r\n\x1a\n", "PNG"),
    ("GIF87a prefix", b"GIF87a", "GIF"),
    ("GIF89a prefix", b"GIF89a", "GIF"),
    ("incomplete PNG prefix", b"\x89PNG", "Unknown"),
    ("empty", b"", "Unknown"),
]
for name, header, expected in samples:
    hint = signature_hint(header)
    assert hint == expected
    print(f"{name}: {hint}")
```

이 입력들은 Signature만 있는 바이트열이다. PNG라고 출력되는 8바이트에도 IHDR·이미지 데이터·IEND가 없으므로 완전한 PNG 파일이 아니다. GIF에는 `GIF87a` 또는 `GIF89a` 헤더가 있고 JPEG의 시작 표시는 `FF D8`, 끝 표시는 `FF D9`지만, 시작·끝 바이트만 맞추어도 올바른 이미지가 되는 것은 아니다. 실제 파일에서는 처음 8바이트를 읽어 이런 단서를 얻은 뒤 디코더로 구조와 데이터의 유효성을 별도로 확인한다.
