---
layout: default
title: Amazon Bedrock
nav_order: 2
permalink: /wiki/amazon-bedrock/
publication_state: publish
has_toc: true
projection_id: Wiki/platform-delivery-operations/cloud/amazon-bedrock
projection_sha256: 6cb169f3f9952df5453338ac07f031f89650dbc2bb1c6b5bafba2c91ce7a1a4c
parent: 관리형 서비스
content_status: ready
public_parent_id: Wiki/keywords/platform-delivery-operations-topic-f5955687c1b2
grand_parent: 클라우드
ancestor: DevOps
---

# Amazon Bedrock
{: .no_toc }

Amazon Bedrock은 모델 호출에 더해 문서 검색, 실행 흐름과 응답 필터를 연결하는 기능을 제공한다. Knowledge Base는 답변에 필요한 문서를 찾고, Flow는 처리 순서를 표현하며, Guardrail은 입력과 출력에 적용할 정책을 검사한다. 계산이나 외부 조회가 필요하면 Agent의 도구 호출과 연결한다.

주택 관련 지침을 검색하는 질문과 특정 매물의 가격을 조회해 계산하는 요청은 필요한 정보가 다르다. 아래에서는 이 차이를 따라 문서 색인, 검색·생성, 도구 실행과 검사 범위를 살펴본다. 계정에서 서비스를 구성할 때는 선택한 리전의 기능·모델 지원 여부와 권한을 먼저 확인한다.

## 문서를 검색 가능한 근거로 만들기

모델의 학습 데이터에 포함되지 않은 사내 문서나 새로 바뀐 지침은 질문할 때 따로 제공해야 한다. 모든 문서를 매번 프롬프트에 넣으면 입력 길이와 비용이 커진다. RAG는 질문과 관련된 부분을 검색한 뒤 모델의 답변 문맥에 넣는 방식이다.

Knowledge Base의 벡터 검색 구성을 사용하면 문서 처리, Embedding 생성과 Vector Store 연결을 관리형 기능으로 구성할 수 있다. 이때 문서 색인을 준비하는 단계와 질문에 답하는 단계를 구분한다.

```text
색인 준비
  S3 원문 → Chunking → Embedding 모델 → Vector Store

질문 처리
  질문 → 질문의 Embedding → Vector Store에서 관련 Chunk 검색
  검색한 Chunk + 질문 → 생성 모델 → 답변과 Citation
```

워크숍의 S3 문서를 연결하는 설정은 다음과 같다.

| 항목 | 설정과 확인할 내용 |
| --- | --- |
| Service Role | 새 Role을 만들거나 워크숍에서 제공한 Role 사용 |
| Data Source | S3 Bucket 또는 워크숍에서 지정한 S3 경로 |
| Chunking | 약 300 Token을 기준으로 문서 분할 |
| Embedding 모델 | Titan Text Embeddings v2 |
| Vector Store | Quick create로 구성한 OpenSearch Serverless |

기본 Chunking은 문장 경계를 고려해 약 300 Token 단위로 나눈다. 고정 크기를 직접 설정하는 경우에는 선택한 분할 방식과 최대 Token 수를 함께 확인한다. 이 값이 모든 문서에 가장 좋은 설정이라는 뜻은 아니다. 문단의 의미가 잘리거나 서로 다른 주제가 한 Chunk에 섞이면 검색 결과도 영향을 받는다. [AWS Chunking 설명](https://docs.aws.amazon.com/bedrock/latest/userguide/kb-data-source-customize-ingestion.html)

Knowledge Base와 Vector Store 생성이 끝나면 Data Source의 **Sync**를 실행한다. S3 원문을 연결해 두는 것과 검색 색인이 준비된 것은 별개다. 원문을 추가하거나 수정한 뒤에도 다시 Sync해 검색 대상에 반영되었는지 확인한다.

Sync에 실패하면 S3 경로와 객체 존재 여부부터 확인한다. 다음으로 Service Role의 S3 읽기 권한, Embedding 모델 사용 권한, Vector Store의 생성·접근 상태를 살핀다. Embedding 모델과 답변 생성 모델은 역할이 다르므로 각각 접근할 수 있어야 한다. 워크숍과 다른 리전에서 작업 중인지도 함께 확인한다.

## 검색 결과와 생성 답변을 따로 확인하기

먼저 **Generate responses**를 끄고 검색한 Chunk만 확인한다. API로는 `Retrieve`가 이 단계에 해당하고, `RetrieveAndGenerate`는 검색 결과를 사용해 답변을 생성하고 Citation까지 반환한다. [AWS 검색 API 설명](https://docs.aws.amazon.com/bedrock/latest/userguide/kb-how-retrieval.html)

원문의 주택 문서가 들어 있는지 확인할 때는 다음 두 질문을 사용할 수 있다.

- `What's the lead paint guidelines for homes sold?`
- `주택 판매 시 납 페인트 관련 가이드라인은 무엇인가?`

질문과 관련된 Chunk가 나오는지, Source가 예상한 문서인지, 검색 Score가 어떻게 달라지는지 살펴본다. Score가 높다는 사실만으로 문서 내용이 사실이거나 답변의 근거로 충분하다고 판단하지는 않는다.

그다음 Generate responses를 켜고 같은 질문을 보낸다. 응답 생성 모델은 현재 계정·리전과 Knowledge Base에서 지원하는 모델 중에서 선택한다. 모델에 따라 지원 기능과 수명 주기가 다르므로, 예전 실습 화면의 모델명을 그대로 고정하지 않는다. [AWS 모델 수명 주기](https://docs.aws.amazon.com/bedrock/latest/userguide/model-lifecycle.html)

답변에 Citation이 붙었는지만 보지 말고, 인용된 Chunk가 해당 문장을 실제로 뒷받침하는지 읽는다. 문서에 없는 주장을 덧붙였는지도 확인한다. 답변이 자연스러워도 검색 결과가 틀렸다면 생성 모델을 바꾸는 것만으로 해결되지 않을 수 있다.

| 증상 | 먼저 확인할 지점 |
| --- | --- |
| 새 문서가 검색되지 않음 | S3 변경 뒤 Sync가 완료되었는지 |
| 질문과 다른 Chunk가 검색됨 | 질문·문서의 표현 차이, Chunk 크기와 경계, 검색 대상 |
| 검색은 맞지만 답변 근거가 약함 | 생성 답변과 Citation의 실제 대응 관계 |
| 검색과 생성 중 어디가 문제인지 불명확함 | Generate responses를 끄고 검색 결과부터 재확인 |

직접 RAG를 구현할 때는 Chunking, Embedding, Vector DB, 검색, Prompt 조립과 Citation 처리를 설계한다. Knowledge Base는 이 연결의 상당 부분을 맡지만, 어떤 문서를 넣고 무엇을 좋은 검색 결과로 볼지는 애플리케이션이 정해야 한다. Embedding 자체는 [Embedding](/wiki/ai-machine-learning-topic-7c4a8b2afe4c/), 검색 결과의 품질은 검색 평가와 연결된다.

## 검색과 도구 실행 연결하기

문서에 적힌 정책을 찾는 일과 숫자로 계산하거나 최신 매물을 조회하는 일은 구분해야 한다. Agent에는 각 도구의 역할과 입력 형식을 알려 주고, 어떤 요청에 검색과 도구 호출이 필요한지 Instruction에 명시한다. 정책·FAQ·가이드라인은 검색 근거를 사용하고, 계산과 외부 조회는 해당 기능을 구현한 도구에 맡기는 식이다.

새 AWS 구성에서는 AgentCore Gateway로 Lambda나 REST API를 도구로 연결할 수 있다. Gateway는 Lambda·OpenAPI 같은 Target을 MCP 도구로 노출한다. 기존 Agents Classic의 Action Group을 새로 만드는 절차와는 다른 구성이다. [AgentCore Gateway 구성 요소](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-core-concepts.html)

| 필요한 작업 | 도구가 맡는 일 |
| --- | --- |
| 대출 계산 | 입력한 숫자로 정해진 계산 수행 |
| 부동산 정보 조회 | 매물 ID로 외부 데이터 조회 |
| 정책·자격 기준 확인 | Knowledge Base에서 관련 문서 검색 |

Lambda Target에는 도구 Schema와 Lambda가 기대하는 입력 형식을 맞추고, Gateway의 실행 Role에 호출 권한을 부여한다. 기존 Lambda를 가져오는 경우에도 이전 이벤트 형식을 그대로 사용할 수 있는지는 확인해야 한다. REST API를 OpenAPI Target으로 연결하는 방식은 API의 작업·파라미터 정의를 사용한다. [Lambda Target의 입력 계약](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-add-target-lambda.html), [OpenAPI Target](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-schema-openapi.html)

```text
사용자 요청과 Instruction
  → Agent가 필요한 검색·도구 선택
  → 도구 Schema를 바탕으로 입력 구성
  → 연결된 함수나 API가 작업 실행
  → 결과를 모델 문맥에 반영
  → 최종 답변
```

이 흐름에서 Agent는 무엇을 호출할지 선택하고, 함수나 API는 정의된 작업을 실행한다. Schema는 호출 형식을 설명한다. 검색과 도구가 모두 필요할 수 있지만, 연결해 두었다고 매번 의도대로 선택되는 것은 아니다. AI 에이전트와 도구 호출에서 다루는 판단과 실행의 차이가 여기에 드러난다.

## 검색·호출·답변을 대조하기

테스트 질문은 문서 검색만 필요한 경우와 계산·조회까지 필요한 경우로 나눈다.

| 확인할 동작 | 질문 예 |
| --- | --- |
| 문서에서 자격 기준 검색 | Fannie Mae가 지원하는 단독 주택 대출의 자격 조건은 무엇인가? |
| 소득·매물 조회와 정책 검색 결합 | 연 소득이 70,000달러이고 매물 ID가 MLS-5678일 때, 대출 계산과 관련 프로그램 확인에 어떤 정보가 필요한가? |

두 번째 질문에는 매물 가격 같은 조회 결과와 계산 조건이 필요하다. 그런 값이 없는데도 확정적인 결과를 만들어 내는지 살펴본다. 도구가 실제로 호출되었는지, 입력 파라미터와 응답이 맞는지, 최종 답변이 검색·도구 결과를 사용했는지 실행 기록과 대조한다.

도구가 실행되지 않는 문제는 Agent가 도구를 선택하지 않은 경우와 선택한 뒤 권한·입력 계약에서 실패한 경우로 나눈다. 전자라면 질문, Instruction과 도구 설명을 살피고, 후자라면 호출 권한과 입력·응답 형식을 확인한다. 검색 역시 관련 자료를 찾지 못한 것인지 검색 자체를 시도하지 않은 것인지 구분해야 한다.

설정을 바꾼 뒤에도 이전 동작이 나오면 실제 호출하는 배포 버전과 설정을 확인한다. 테스트 중인 코드가 바뀌었다는 사실만으로 서비스가 새 버전을 사용한다고 판단하지 않는다.

## 정해진 순서를 Flow로 표현하기

Flow는 입력, 조건, Lambda, Prompt 같은 노드를 연결해 실행 순서를 명시한다. 업무 절차가 정해져 있으면 그래프에 그 순서와 분기 조건을 표현한다.

| Flow 설정 | 워크숍 값 |
| --- | --- |
| 이름 | `process-mortgage-application-flow` |
| Role | 워크숍의 Prompt Flow Role 또는 새 Role |
| Encryption | 기본 AWS 관리형 Key |
| Flow Input의 Output Type | `Object` |
| 사용할 노드 | Condition, Lambda, Prompt, Flow Output |

콘솔에서 생성한 Flow의 기본 Prompt 노드와 연결을 확인한 뒤, 필요한 Condition과 Lambda 노드를 배치한다. 각 노드의 입력값이 어디에서 오고 출력값이 어디로 전달되는지 연결선을 따라 확인한다. [AWS Flow 생성 문서](https://docs.aws.amazon.com/bedrock/latest/userguide/flows-create.html)

```text
Flow Input(Object)
  → Condition에서 조건 판단
  → Lambda에서 필요한 데이터 조회
  → Prompt에서 입력 문맥 구성과 응답 생성
  → Flow Output
```

이 배치는 각 노드의 역할을 설명하기 위한 예다. 실제 Flow에서는 Condition의 분기 조건과 각 노드의 입력·출력 연결을 정의해야 한다. 정해진 절차와 요청별 판단을 결합할 때도 노드가 받는 값과 반환하는 값을 먼저 맞춘다.

## Guardrail이 검사하는 범위

Guardrail `bedrock-ws-guardrails`를 만들고, 차단 시 사용자에게 보여 줄 메시지와 기본 AWS 관리형 Key를 설정한다. 정책마다 무엇을 검사하는지 구분해야 범위를 과하게 넓혀 정상 입력까지 막는 일을 줄일 수 있다.

| 설정 | 살펴볼 대상 |
| --- | --- |
| Content Filters | 유해하거나 부적절한 내용 |
| Denied Topics | 애플리케이션에서 다루지 않기로 한 주제 |
| Word Filters | 차단 대상으로 지정한 단어·표현 |
| Sensitive Information Filters | 민감정보의 탐지와 차단·가림 처리 |
| Contextual Grounding | 답변이 제공한 근거와 질문에 부합하는지 |

Guardrail은 금지 주제와 민감정보 같은 운영 정책을 적용한다. Contextual Grounding은 답변이 주어진 근거와 질문에 부합하는지도 검사한다. 필터 결과와 별개로 실제 답변의 정확성은 평가 데이터와 원문을 통해 확인해야 한다. [AWS Guardrails 설명](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html)

사용 중인 모델·API·Agent 통합에서 어떤 Guardrail 검사가 지원되고 어느 입력·출력에 적용되는지 확인한다. 특히 Contextual Grounding은 근거 자료, 질문, 검사할 응답을 필요로 하므로 Guardrail 하나를 붙였다고 모든 Agent 중간 단계와 도구 결과의 근거 검증이 자동으로 끝난다고 보지 않는다. [Contextual Grounding의 입력 조건](https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-contextual-grounding-check.html)

테스트에는 차단할 입력과 정상적으로 허용할 입력을 함께 넣는다. 정상 질문까지 차단되면 Denied Topic 설명과 Word Filter의 범위부터 살피고, 민감정보가 들어간 입력과 응답에서는 기대한 차단·가림 처리가 적용되는지 별도로 확인한다. 정책 범위와 답변의 근거성은 AI 안전성과 AI 평가로 이어진다.

## 여러 Agent에 역할 나누기

여러 Agent를 함께 사용할 때는 요청 분류, 기술 설명, 정책 해석을 나누고 Supervisor가 조율하는 구성을 생각할 수 있다.

| 역할 | 맡는 일 |
| --- | --- |
| Intent Classification Agent | 사용자 요청의 종류 분류 |
| Technical Specialist | 기술적 세부 질문 처리 |
| Policy Specialist | 정책과 가이드라인 해석 |
| Supervisor | 하위 Agent 조율과 최종 응답 구성 |

역할을 나누면 각 Agent에 어떤 지식과 도구를 맡겼는지 따로 검사할 수 있다. 동시에 호출 횟수, 지연, 비용과 조율 복잡도가 늘어날 수 있다. 분담 자체가 품질 향상을 보장하는 것은 아니므로, 단일 Agent와 비교해 어디에서 도움이 되는지 여러 에이전트의 협업 기준으로 확인한다.

실습을 마친 뒤에는 Knowledge Base만 삭제하고 Vector Store가 남아 있지는 않은지 확인한다. S3 원문, OpenSearch Serverless와 관련 리소스의 보존·삭제 범위는 [비용 관리](/wiki/platform-delivery-operations-topic-342f2ec03420/)에서 다룬다.
