---
layout: default
title: 커널 구조
nav_order: 3
permalink: /wiki/computer-systems-network-topic-5cd3e3706e06/
publication_state: publish
has_toc: true
projection_id: Wiki/keywords/computer-systems-network-topic-5cd3e3706e06
projection_sha256: aa07f768d75afc051e7769c535b1dfbcc04bad74324c4a526412a38f267dc33f
parent: PintOS
content_status: ready
public_parent_id: Wiki/projects/pintos
grand_parent: OS
ancestor: CS 기초
---

# 커널 구조
{: .no_toc }

PintOS에서 파일을 읽는 요청은 System Call에서 파일 객체와 inode를 거쳐 디스크 Driver로 이어진다. 이 기능들은 같은 커널 주소 공간에서 함수 호출로 연결된다. 아래 설명은 [lrn-pintos의 `5afaa6d`](https://github.com/woonyong-kr/lrn-pintos/tree/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0)를 기준으로 한다.

## 같은 커널 주소 공간에서 이어지는 호출

일반 파일의 읽기는 System Call Handler의 읽기 경로에서 `file_read()`·`inode_read_at()`을 거쳐 필요할 때 `disk_read()`로 내려간다. 쓰기는 `file_write()`·`inode_write_at()`·`disk_write()`로 이어진다.

`file_read()`·`file_write()`는 실제로 처리한 길이만큼 파일 객체의 위치를 옮긴다. `_at` 함수들은 명시한 offset을 사용하고 핸들의 위치를 바꾸지 않는다. 사용자 메모리와 Kernel Buffer 사이의 검증·복사는 [시스템 콜](/wiki/computer-systems-network-topic-3cc26725c1cb/), 이후의 Sector별 처리는 [파일 시스템 구현](/wiki/computer-systems-network-topic-c76b83867c50/)에 연결된다.

표준 출력인 fd 1은 Console 경로로 처리한다. 파일 시스템의 호출 Stack을 비교할 때는 일반 파일을 열어 얻은 fd를 사용한다.

같은 Thread가 이 함수들을 실행한다는 사실과 중간에 Context Switch가 없다는 주장은 다르다. 현재 IDE Driver는 Channel Lock과 완료 Semaphore를 사용한다. I/O를 기다리며 Block된 Thread가 나중에 깨어나 같은 호출 Stack을 이어 갈 수 있다. 두 중단점에서 Thread 이름이 같다는 사실만으로 그 사이에 다른 Thread가 실행되지 않았다고 결론 내릴 수는 없다. [디스크 대기와 완료](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/devices/disk.c)

## 부팅이 준비하는 기반

`threads/init.c`의 `main()`은 BSS와 명령행을 준비하고 `thread_init()`으로 초기 실행 상태를 잡는다. 이어 물리 Page 할당자와 작은 메모리 할당자, Kernel Page Table을 준비한다. 인터럽트·Timer·입력 장치를 초기화하고, 빌드 설정에 따라 사용자 프로그램의 보호·예외·System Call 기능을 더한다.

`thread_start()`는 Idle Thread를 만들고 인터럽트를 허용한다. Serial Queue 초기화와 Timer 보정, 파일 시스템 빌드의 디스크 초기화는 그 뒤에도 이어진다. 따라서 이 함수 하나를 모든 OS 초기화의 완료점으로 보면 안 된다. `Boot complete.`와 명령행 작업 실행까지의 실제 순서를 함께 읽는다. [부팅의 초기화 순서](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/init.c)

인터럽트를 허용한 커널은 타이머에 의해 선점될 수 있다. 인터럽트를 끈 구간과 외부 인터럽트 문맥에서는 허용되는 동작이 달라진다. 전환을 요청하는 조건과 요청을 처리하는 시점은 [Interrupt](/wiki/computer-systems-network-topic-c19e34701c6c/)에서 코드 순서로 살펴본다.

## 주소 공간을 공유할 때의 영향 범위

커널 구성 요소가 같은 권한과 주소 공간에서 실행되면 포인터를 직접 전달할 수 있지만, 잘못된 메모리 쓰기가 다른 구성 요소의 상태도 손상시킬 수 있다. Module을 파일로 나누어 빌드하는 것과 서로 다른 보호 영역으로 분리하는 것은 별개다.

장애 결과는 발생한 예외와 Handler의 처리 경로에 달려 있다. 현재 `#GP` 처리에서는 저장된 CS로 발생한 영역을 구분한다. 복구 가능한 Page Fault는 VM 경로에서 처리한 뒤 실행을 이어 갈 수 있다. 커널과 서버를 나누는 일반적인 설계의 차이는 [OS의 커널 경계](/wiki/os/#kernel의-경계를-나누는-방법)에서 비교한다.

## Debugger에서 비교할 대상

같은 빌드의 Debug Symbol을 연결한 뒤 `syscall_handler`, `file_read` 또는 `file_write`, `inode_read_at` 또는 `inode_write_at`, `disk_read` 또는 `disk_write`의 인자와 호출 Stack을 비교한다. `bt`는 현재 호출의 관계를 보여 주지만 그 이전의 모든 Scheduling 기록을 대신하지 않는다.

System Call 번호는 저장된 `intr_frame`의 `R.rax`에서 읽는다. `page_fault()`의 접근 조건은 저장된 Error Code와 CR2를 함께 확인한다. 관찰한 함수 인자와 Thread 식별자, 중단 시점을 기록하면 출력이 실제로 무엇을 보여 주는지 구분할 수 있다. 구체적인 명령과 관찰 시점은 [Debugger](/wiki/platform-delivery-operations-topic-f89d71c7eb29/)와 [페이지 폴트](/wiki/computer-systems-network-topic-5cebdbc10ddf/)에서 이어서 확인한다.
