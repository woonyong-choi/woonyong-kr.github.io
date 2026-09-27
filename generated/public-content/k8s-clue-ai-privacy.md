---
layout: default
title: Clue AI와 개인정보
nav_order: 7
permalink: /wiki/k8s-clue-ai-privacy/
publication_state: publish
has_toc: true
projection_id: Wiki/projects/k8s-clue/ai-privacy
projection_sha256: 5fa7a9d50737108058d58d9ccfce9fc0a1ee7e716d2e0f4c3cc373ea1d647d54
parent: K8s Clue
content_status: ready
public_parent_id: Wiki/projects/k8s-clue
grand_parent: Projects
---

# Clue AI와 개인정보
{: .no_toc }

## AI의 위치

Clue의 핵심 진단은 AI 없이 동작한다.

```text
Kubernetes Evidence
→ deterministic Analyzer
→ Finding과 Rule ID
→ 선택적 AI 설명
```

AI가 담당할 수 있는 기능:

- 기술적인 Finding을 이해하기 쉬운 설명으로 변환
- 여러 Evidence의 시간 순서 요약
- 사용자가 물어본 후속 질문에 Evidence 범위 안에서 답변
- Remediation Plan의 위험과 확인 항목 설명
- Incident 보고서 초안 작성

AI가 기본적으로 하지 않는 기능:

- 원본 Evidence 없이 원인 확정
- Kubernetes API 직접 수정
- 자유 형식 manifest 자동 적용
- 사용자 동의 없는 외부 전송

## Provider 우선순위

1. AI 사용 안 함
2. 사용자가 실행 중인 로컬 모델 API
3. 로컬 도구 어댑터
4. 사용자가 제공한 외부 API key

지원 후보:

- Ollama
- LM Studio
- llama.cpp server
- OpenAI-compatible local endpoint
- 사용자 제공 OpenAI/Anthropic 등 API

## Claude Code와 Codex CLI 활용

로컬에 로그인된 Claude Code나 Codex CLI를 Clue가 하위 프로세스로 호출하는 방식은 가능하다. 다만 안정된 public API가 아닌 CLI 출력에 의존하면 버전 변경, interactive prompt, 권한 승인과 인증 상태 때문에 쉽게 깨질 수 있다.

따라서 다음 두 방식을 구분한다.

### MCP 방식 - 권장

Clue가 MCP server를 제공하고 Claude Code나 Codex가 Clue의 Evidence 조회 도구를 호출한다.

- 사용자가 이미 선택한 AI 도구 안에서 질문
- Clue는 구조화된 Evidence만 제공
- 수정 도구는 read-only와 approval-required로 구분
- AI 제품의 로그인과 세션 수명주기를 Clue가 소유하지 않음

### External command provider - 실험 기능

Clue가 허용된 로컬 CLI를 JSON stdin/stdout wrapper로 호출한다.

- 최초 1회 설치된 provider를 보여주고 사용자가 선택
- 선택을 profile에 저장
- timeout, 최대 입력 크기, working directory와 environment allowlist 적용
- Secret과 credential environment를 자식 프로세스에 전달하지 않음
- CLI가 삭제되거나 인증이 풀리면 명확한 재선택 안내
- 자동 fallback으로 다른 provider에 데이터를 보내지 않음

## 가명화와 민감정보 제거

외부 AI로 보내기 전 다음 항목을 정책에 따라 치환한다.

- cluster와 namespace 이름
- workload와 container 이름
- private registry와 사내 domain
- IP 주소
- cloud account ID
- 민감 label·annotation
- Git repository 이름
- 사용자 email

Secret 값은 가명화 대상이 아니라 애초에 수집하지 않는다.

`완전 익명화`라는 표현은 사용하지 않는다. 오류 메시지와 구조만으로 조직을 추론할 수 있으므로 정확한 용어는 `가명화와 민감정보 제거`다.

치환 대응표는 로컬 또는 신뢰 경계 안에만 보관하고 AI 응답을 사용자에게 표시할 때 원래 resource identity로 복원한다.

## 전송 전 확인

```bash
clue ai explain INCIDENT_ID --preview-payload
```

사용자는 provider, 전송 대상 endpoint, payload 크기, 제거·치환된 필드를 확인할 수 있어야 한다. 외부 전송 기록에는 payload hash, provider, model, policy version과 사용자의 승인만 남기며 Secret 원문은 남기지 않는다.
