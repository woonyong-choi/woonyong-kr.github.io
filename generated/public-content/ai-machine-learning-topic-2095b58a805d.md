---
layout: default
title: Prompt
nav_order: 4
permalink: /wiki/ai-machine-learning-topic-2095b58a805d/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/ai-machine-learning-topic-2095b58a805d
projection_sha256: 1689d2c2cb0803a5a57fae19c9e958adddc6fddad7804fbd40e659b66b9f2fa1
parent: AI 애플리케이션
content_status: ready
public_parent_id: Wiki/ai-machine-learning/applications
search_terms:
- 프롬프트
grand_parent: AI
---

# Prompt
{: .no_toc }

## 예시가 없는 요청과 예시를 포함한 요청

LLM prompting에서 zero-shot은 과업 예시 없이 지시와 입력을 주는 방식이고, few-shot은 소수의 입력·정답 예시를 문맥에 포함하는 방식이다. 여기서 shot은 요청에 보여 준 예시 수다. 호출마다 모델 파라미터를 다시 학습한다는 뜻이 아니다.

다음은 같은 감성 분류 요청을 두 방식으로 구성한 예다. 실제 모델 응답이나 정확도 측정 결과는 포함하지 않는다.

```text
Zero-shot
다음 문장의 감성을 positive 또는 negative 중 하나로 출력한다.
문장: 배송은 늦었지만 제품은 마음에 든다.
감성:
```

```text
Few-shot
문장의 감성을 positive 또는 negative 중 하나로 출력한다.
문장: 화면이 선명하고 배터리도 오래 간다.
감성: positive

문장: 앱이 자주 멈추고 사용하기 어렵다.
감성: negative

문장: 배송은 늦었지만 제품은 마음에 든다.
감성:
```

설명만으로 의미가 분명한 과업에는 zero-shot을 기준으로 비교할 수 있다. 라벨의 경계나 출력 형식을 예로 보여 줄 필요가 있다면 few-shot을 시도한다. 예시가 존재한다는 사실만으로 출력 형식이나 판단 정확도가 보장되지는 않으므로 결과를 파싱하고 별도 평가한다.

## 예시를 늘릴 때 무엇이 달라지는가

예시의 레이블 분포·순서·난이도는 모델의 응답에 영향을 줄 수 있다. 예시가 많아지면 문맥을 차지하고 처리 비용이 들며, 실제 입력에 남는 길이가 줄어든다. 쉬운 예시만 넣거나 한쪽 라벨만 반복하면 의도한 과업보다 좁은 패턴을 보여 줄 수 있다. 예시 수를 늘리기 전에 지시가 모호한지, 라벨 정의가 일관되는지부터 확인한다.

비교할 때는 모델 버전, prompt 전체, 예시 선정 절차, 평가 데이터, sampling 설정을 고정하거나 변경 내역을 기록한다. 한 문장에 답이 출력된 것과 새로운 입력에서 안정적으로 동작하는 것은 다른 수준의 근거다.

## 예시를 잘 골랐다는 것과 일반화 성능이 높다는 것

Few-shot prompt에 test와 중복되거나 매우 비슷한 예시를 넣으면 원래보다 쉬워진 문제를 풀게 된다. 평가에서는 예시와 test의 중복, 예시 순서, 레이블 표현, 쉬운 사례에 치우친 표본 구성을 각각 확인한다. 평가용 예시를 바꿨을 때 결과가 흔들리면 prompt 하나의 점수만으로 안정된 성능을 주장하기 어렵다.

여기서 few-shot prompting은 입력 문맥에 예시를 넣는 방식이고, few-shot [미세 조정](/wiki/ai-machine-learning-topic-1bafac0ace2a/)은 적은 데이터로 실제 파라미터를 갱신하는 방식이다. 용어에 같은 few-shot이 들어가더라도 실행 비용과 학습 여부를 구분해야 한다. [제로샷 학습과 퓨샷 학습 · 7875b64](https://github.com/woonyong-kr/lrn-gpt/blob/7875b64f85f19959d66dcaf06c1dcbeb129d71eb/docs/woonyong/05-zero-shot-few-shot.md)
