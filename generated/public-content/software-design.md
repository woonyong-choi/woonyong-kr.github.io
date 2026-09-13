---
layout: default
title: 소프트웨어 설계
nav_order: 11
permalink: /wiki/software-design/
publication_state: publish
has_toc: true
projection_id: Wiki/backend-services/software-design
projection_sha256: f5523a7333bd962e0ec4fa950801ab074c107c75896b308f3675807db8cf63fe
parent: Programming
content_status: ready
public_parent_id: Wiki/programming-languages-runtime
search_terms:
- 소프트웨어 설계
- Software Design
---

# 소프트웨어 설계
{: .no_toc }

소프트웨어 설계는 프로그램의 책임과 상태, 의존 관계를 어떻게 나눌지 정하는 일이다. API의 입력과 출력, 실패 조건, 상태가 바뀌는 순서를 설명하면 구현을 바꿀 때 지켜야 할 동작도 드러난다. 기존 동작을 유지하며 구조를 바꾸는 과정은 [Refactoring](/wiki/backend-services-topic-04200cad6c42/)에서 다룬다.

설계 문서는 다른 사람이 이런 경계와 선택의 이유를 이해하도록 돕는다. 구현에 필요한 판단을 글로 설명할 때도 독자와 목적에 맞는 구조가 필요하다.

## 독자가 다음에 할 일을 먼저 정한다

README를 읽는 사람은 실행 방법을 찾을 수 있고, 설계 리뷰에 참여한 사람은 선택한 구조의 제약을 알고 싶을 수 있다. 두 문서에 같은 목차를 채우기보다 독자가 알아야 할 전제와 읽은 뒤 할 일을 먼저 정한다. 첫 문단에서는 핵심 동작이나 결론을 설명하고, 뒤에서 필요한 근거를 풀어낸다. [Google Technical Writing: Documents](https://developers.google.com/tech-writing/one/documents)

예를 들어 API 사용법은 요청을 만들고, 응답을 읽고, 오류를 처리하는 순서가 자연스럽다. 설계 문서는 해결할 문제와 제약을 밝힌 뒤 선택 이유와 남은 한계를 설명할 수 있다. 순서가 있는 절차는 번호 목록으로, 같은 기준의 선택지는 표로 제시한다. 설명이 이어지는 문단까지 모두 목록으로 쪼갤 필요는 없다.

## 문장에는 동작의 주체와 조건을 남긴다

“오류가 발생하면 처리가 수행된다”는 문장만으로는 누가 무엇을 하는지 알기 어렵다. 실제 동작이 맞다면 “서버는 입력이 비어 있으면 400 응답을 반환한다”처럼 주체·조건·결과를 적는다. 문장을 짧게 만드는 것보다 필요한 정보가 빠지지 않는 것이 먼저다.

한 문단에서는 한 가지 생각을 발전시키고, 처음 등장한 낯선 용어는 해당 문맥에서 설명한다. 같은 개념의 이름을 문서마다 바꾸지 않으며 익숙한 API·Class·Queue 같은 기술 용어는 억지로 번역하지 않는다. 어체는 독자와 글의 목적에 맞춰 일관되게 유지한다. 초안을 소리 내어 읽으면 번역투나 긴 문장, 앞뒤가 끊긴 부분을 찾는 데 도움이 된다. [Google Technical Writing: Self-editing](https://developers.google.com/tech-writing/two/editing)

## 예제로 설명한 내용을 확인한다

실행 예제에는 필요한 환경과 입력, 실행 방법, 예상 결과를 함께 둔다. 완성된 프로그램과 설명용 코드 조각을 구분하고, 본문에서 하지 않는 일을 예제가 한다고 주장하지 않는다. 실제 출력이 설명과 일치하는지 확인하며 의존성이나 버전이 바뀌면 영향을 받는 예제를 다시 검사한다. [Google Technical Writing: Creating sample code](https://developers.google.com/tech-writing/two/sample-code)

그림도 본문의 질문에 답해야 한다. 요청 흐름을 설명한다면 화살표가 무엇을 전달하는지, 어느 단계에서 실패할 수 있는지 본문과 맞춘다. 문서를 따라 실행하는 사람에게 빠진 전제가 없는지 확인하면 작성자에게만 자명했던 단계를 찾을 수 있다.

LLM으로 초안을 만들거나 문장을 고칠 때는 독자·목표·근거 자료를 함께 제공한다. 첨부한 코드에도 오류가 있을 수 있으므로 생성된 설명이 유창하다는 이유로 동작이 확인된 것으로 보지 않는다. 구조와 사실을 먼저 검토하고 문장을 다듬는다. 구현 사실과 예제의 실제 실행 결과는 작성자가 근거와 다시 대조해야 한다. [Google Technical Writing: LLM 활용](https://developers.google.com/tech-writing/two/llms)
