---
layout: default
title: QEMU
nav_order: 3
permalink: /wiki/computer-systems-network-qemu-b1366076be02/
publication_state: publish
has_toc: false
projection_id: Wiki/keywords/computer-systems-network-qemu-b1366076be02
projection_sha256: 5db7c8c9acb414b9773802fe3233f40eaed212acee1223ec85b1e3ee0f2a418d
parent: 개발 환경
content_status: ready
public_parent_id: Wiki/keywords/computer-systems-network-topic-327968e136ec
search_terms:
- CPUX86State
- Guest Register Hosting
- gpr_map
- cpu_synchronize_state
- gdb_target_memory_rw_debug
- RAMBlock
- MemoryRegion
- FlatView
- AddressSpace
- Guest Physical Memory
- address_space_rw
- Translation Block
- TB
- TCG IR
- MemoryRegionOps
- info jit
- info mtree
grand_parent: PintOS
ancestor: CS 기초
---

# QEMU
{: .no_toc }

## write가 멈췄다면 어느 코드를 읽어야 하는가

PintOS에서 `write(1, buffer, size)`가 기대한 문자를 출력하지 않았다고 하자. 사용자 프로그램이 인자를 전달했는지, CPU가 커널 진입점으로 이동했는지, 커널이 버퍼를 읽고 출력 장치에 보냈는지는 서로 다른 질문이다. QEMU를 사용한다는 사실만으로 어느 단계가 실패했는지 정해지지 않는다.

여기서는 [lrn-pintos `5afaa6d`](https://github.com/woonyong-kr/lrn-pintos/tree/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0)를 가상 PC에서 실행하는 **system emulation**을 기준으로 이 경계를 따라간다. 구체적인 QEMU 소스는 [v10.0.0](https://github.com/qemu/qemu/tree/v10.0.0)으로 고정한다. 코드와 공식 문서를 읽어 확인한 설명이며, 아래 관찰 절차를 실제 PintOS·QEMU에서 실행하거나 성능을 측정한 기록은 아니다.

### 먼저 실행 모드를 구분한다

`qemu-system-x86_64`는 CPU·메모리·장치로 구성한 가상 머신을 제공하고 그 위에서 Guest OS를 실행한다. PintOS가 syscall 번호를 해석하고, 다음 Thread를 고르고, 파일 이름을 찾는 코드도 이 Guest 안에서 실행된다. QEMU는 이 코드가 이용하는 명령어와 장치의 동작을 제공한다. [QEMU의 system emulation](https://www.qemu.org/docs/master/system/introduction.html)

반면 `qemu-x86_64` 같은 **user emulation**은 다른 아키텍처용 사용자 프로그램을 실행하면서 Host 커널의 서비스를 사용한다. `qemu-linux-user`에는 syscall 변환기가 있어 번호·인자와 자료형 크기·바이트 순서 등을 맞추고 Host syscall을 호출한다. `clone`과 신호 처리에도 관여한다. 따라서 “QEMU는 syscall이나 프로세스를 전혀 모른다”는 문장은 QEMU 전체에 적용할 수 없다. [QEMU의 syscall·Thread 변환](https://www.qemu.org/docs/master/user/main.html#system-call-translation)

이 글에서 구분하려는 것은 **PintOS의 내부 자료구조와 정책을 대신 관리하는가**이다. QEMU가 Host 프로세스와 Thread를 사용하고, 파일과 장치를 열고, 가상 머신을 관리한다는 사실은 이 질문과 별개다.

## 가상 CPU를 실행하는 두 경로

Guest 명령어를 실행할 때 TCG는 대상 명령을 중간 표현으로 바꾼 뒤 Host에서 실행할 코드를 생성한다. 예를 들어 Guest의 메모리 읽기가 Host 코드로 번역되더라도, 그 주소를 PintOS의 `tid` 필드로 사용할지 배열 원소로 사용할지는 Guest 코드의 약속이다. 한 Guest 명령이 반드시 Host 명령 하나로 바뀌는 것도 아니다. [TCG의 번역 구조](https://www.qemu.org/docs/master/devel/tcg.html)

Linux에서 사용할 수 있는 KVM은 Linux 커널의 가상화 기능이다. QEMU의 커널 모듈을 뜻하지 않는다. QEMU는 `/dev/kvm`의 API로 VM과 vCPU를 만들고, 지원되는 Host CPU의 가상화 기능으로 Guest 코드를 실행한다. 장치 접근 중 일부는 QEMU로 돌아오지만, 커널 내부 장치 모델이나 vhost, 장치 직접 연결을 사용하는 경로도 있으므로 모든 I/O가 반드시 QEMU 사용자 공간을 거친다고 단정할 수 없다. [KVM API](https://www.kernel.org/doc/html/latest/virt/kvm/api.html), [QEMU의 장치 실행 경로](https://www.qemu.org/docs/master/system/introduction.html#feature-overview)

VM exit와 QEMU 사용자 공간으로의 반환은 같은 사건이 아니다. 가상화 설정이 선택한 사건으로 하드웨어가 Guest 실행을 벗어나도 KVM 커널에서 처리한 뒤 다시 실행할 수 있다. QEMU가 `KVM_RUN`에서 돌아와 처리할 이유와 Guest 커널이 받을 예외를 구분해야 한다. Guest의 `#PF`나 CPL 0의 CR3·MSR 접근이 언제나 QEMU로 전달된다는 규칙은 없다. [KVM_RUN과 반환 상태](https://docs.kernel.org/virt/kvm/api.html#kvm-run)

| 확인할 항목 | TCG | KVM |
|---|---|---|
| Guest CPU 실행 | Guest 명령을 번역한 Host 코드를 실행 | 호환되는 CPU 가상화 기능으로 실행 |
| 아키텍처 조건 | 지원되는 Host·Guest 조합에서 서로 다른 아키텍처도 가능 | Host 커널·CPU와 Guest 아키텍처의 지원 조건을 만족해야 함 |
| syscall 처리 | system mode에서 CPU 진입 동작을 재현하고 Guest 커널이 번호 해석 | Guest 커널이 번호 해석하며 syscall 자체가 항상 VM exit를 요구하지는 않음 |
| 실행 비용 | 번역·메모리·장치 접근 경로와 작업에 따라 달라짐 | VM exit·장치·메모리·Host 스케줄링 등의 영향을 받음 |
| GDB 지원 | system mode에서 breakpoint·watchpoint 지원 | accelerator의 지원 범위에 따라 달라짐 |

KVM을 사용하면 언제나 일정 배수만큼 빨라지거나, TCG이면 언제나 5~20배 느리다는 수치는 이 표에서 나오지 않는다. GDB도 KVM에서는 무조건 하드웨어 breakpoint만 써야 하는 것이 아니다. 메모리에 삽입하는 breakpoint와 accelerator가 제공하는 기능을 구분한다. [QEMU GDB의 breakpoint 지원](https://www.qemu.org/docs/master/system/gdb.html#breakpoint-and-watchpoint-support)

### 같은 PC라도 같은 번역 결과를 쓸 수는 없다

TCG는 Guest 명령을 IR로 표현하고 불필요한 연산을 줄인 뒤 Host 코드를 만든다. 이 결과를 담는 단위가 **Translation Block(TB)**이다. `mov`를 처리한다고 언제나 동일한 IR 하나를 만드는 것은 아니다. 특히 `tcg_gen_ld_i64` 같은 Host 메모리 접근과 Guest 주소 변환을 포함하는 `qemu_ld` 계열을 구별해야 한다. [TCG IR의 메모리 연산](https://github.com/qemu/qemu/blob/v10.0.0/docs/devel/tcg-ops.rst)

TB는 시작 PC만으로 찾지 않는다. QEMU v10.0.0의 `tb_htable_lookup()`과 비교 함수는 코드의 물리 위치, CS Base, CPU 상태와 번역 플래그 등을 함께 확인한다. 페이지 경계에 걸친 명령은 두 번째 코드 페이지도 확인할 수 있다. 같은 VA를 다른 Frame으로 연결했거나 실행 모드가 달라졌다면 이전 번역 결과를 그대로 사용할 수 없는 이유다. [TB 조회 조건](https://github.com/qemu/qemu/blob/v10.0.0/accel/tcg/cpu-exec.c#L159)

분기나 `SYSCALL`처럼 다음 실행 상태를 바꾸는 명령은 TB의 경계가 된다. 번역할 명령 수의 상한과 디버깅 조건도 경계에 영향을 준다. TB의 경계는 C 함수의 경계와 일치하지 않으며, 포함하는 명령 수도 달라질 수 있다. [`tb_gen_code()`의 번역 한도](https://github.com/qemu/qemu/blob/v10.0.0/accel/tcg/translate-all.c#L290)

번역한 코드를 재사용하는 것과 다음 TB로 직접 이동하는 것도 다르다. `goto_tb + exit_tb` 방식은 처음에는 메인 루프로 돌아와 다음 TB를 찾고, 이후 분기 슬롯을 연결해 그 경로를 줄인다. 이 방식은 같은 페이지 안에서 목적지를 정할 수 있는 직접 분기라는 조건을 요구한다. `lookup_and_goto_ptr`는 현재 상태에 맞는 TB 주소를 조회해 이동하는 별도 경로다. 인터럽트를 새로 받을 수 있는 상태 변화 뒤에는 메인 루프로 돌아가 인터럽트를 다시 확인해야 한다. [TB 연결의 조건](https://github.com/qemu/qemu/blob/v10.0.0/docs/devel/tcg.rst#direct-block-chaining)

이 연결 때문에 Host에서 읽은 `env->eip`가 Guest 명령마다 매번 갱신된다고 가정해서는 안 된다. `goto_tb`가 아직 연결되지 않았을 때는 다음 PC 등 상태를 기록하고 메인 루프로 나가지만, 연결된 뒤에는 그 경로를 건너뛰어 다음 TB로 갈 수 있다. 예외가 발생한 위치는 Host PC와 Guest 명령의 대응 정보로 복원한다. 따라서 모든 TB 경계에서 같은 필드를 무조건 갱신한다고 그리지 않고, 상태가 필요한 이탈·복원 지점을 확인한다. [QEMU v10.0.0의 TB 연결과 예외 복원](https://github.com/qemu/qemu/blob/v10.0.0/docs/devel/tcg.rst)

Guest 코드의 바이트를 바꾸면 해당 코드를 번역한 TB와 연결도 무효화해야 한다. 주소 변환 Cache와 코드 Cache는 보관하는 정보가 다르므로 PTE 변경이나 CR3 전환이 모든 TB의 폐기를 뜻하지는 않는다. 같은 코드 Frame과 상태로 돌아왔을 때 기존 TB를 재사용할 여지가 있도록 물리 위치를 함께 관리한다. [코드 변경과 무효화](https://github.com/qemu/qemu/blob/v10.0.0/docs/devel/tcg.rst#self-modifying-code-and-translated-code-invalidation)

다음 모형은 PC·코드 Frame·실행 모드를 조회 조건으로 사용한다. QEMU의 구조체나 해시 함수를 재현하지 않고, 주소 하나만 Cache Key로 사용했을 때 빠지는 조건을 보여 준다. 코드 Frame을 수정하면 그 Frame의 항목을 제거한다.

```run-python
cache = {}
next_tb = 1

def lookup(pc, frame, mode):
    global next_tb
    key = (pc, frame, mode)
    hit = key in cache
    if not hit:
        cache[key] = next_tb
        next_tb += 1
    return cache[key], hit

pc = 0x400123
cases = [
    ('첫 실행', 0x12000, 'user'),
    ('같은 조건', 0x12000, 'user'),
    ('다른 코드 Frame', 0x34000, 'user'),
    ('다른 실행 모드', 0x12000, 'kernel'),
    ('원래 조건으로 복귀', 0x12000, 'user'),
]
observed = []
for label, frame, mode in cases:
    result = lookup(pc, frame, mode)
    observed.append(result)
    print(f'{label}: TB={result[0]}, hit={result[1]}')
assert observed == [(1, False), (1, True), (2, False), (3, False), (1, True)]

changed_frame = 0x12000
removed = [key for key in cache if key[1] == changed_frame]
for key in removed:
    del cache[key]
print('코드 Frame 수정으로 제거한 항목:', len(removed))
assert len(removed) == 2
after = lookup(pc, changed_frame, 'user')
print(f'코드 수정 뒤 재실행: TB={after[0]}, hit={after[1]}')
assert after == (4, False)
assert lookup(pc, 0x34000, 'user') == (2, True)
```

Python 3.9.6에서 실행한 결과다.

```text
첫 실행: TB=1, hit=False
같은 조건: TB=1, hit=True
다른 코드 Frame: TB=2, hit=False
다른 실행 모드: TB=3, hit=False
원래 조건으로 복귀: TB=1, hit=True
코드 Frame 수정으로 제거한 항목: 2
코드 수정 뒤 재실행: TB=4, hit=False
```

처음과 같은 조건에서는 TB 1을 다시 쓴다. Frame이나 실행 모드가 바뀌면 새 항목이 필요하고, 원래 조건으로 돌아오면 이전 항목을 찾는다. 코드 Frame을 수정한 뒤에는 해당 Frame의 번역을 다시 만든다. 이 결과는 모형의 조회 결과이며 QEMU의 적중률이나 실행 시간을 측정한 값이 아니다.

실제 번역 통계를 읽을 때는 해당 빌드의 Monitor에서 `info jit`를 확인한다. Cache 용량·평균 TB 크기·번역 비용은 실행한 버전과 설정에서 확인한다. Cache가 적중한다는 사실만으로 네이티브와 같은 속도라고 판단할 수도 없다. [Monitor의 번역 통계 명령](https://github.com/qemu/qemu/blob/v10.0.0/hmp-commands-info.hx#L245)


### CPU 상태와 RAM은 각각 여러 개일 수 있다

QEMU 프로세스 하나가 Guest CPU 하나만 표현하는 것은 아니다. Machine 구성에 따라 여러 vCPU를 만들 수 있고, MTTCG는 지원 조건에서 vCPU마다 Host Thread를 둔다. Host가 그 Thread들을 실행할 차례를 정하는 일과 PintOS가 Guest Thread를 고르는 일은 다른 스케줄링이다. [QEMU의 다중 vCPU 실행](https://www.qemu.org/docs/master/devel/multi-thread-tcg.html)

x86 CPU의 `CPUX86State`는 일반 레지스터뿐 아니라 제어 레지스터·세그먼트·MSR·부동소수점 상태 등을 담는다. 이것을 PintOS의 프로세스 테이블로 읽거나 크기를 고정된 바이트 수로 외우지 않는다. Guest 메모리도 `RAMBlock` 하나로만 이루어져야 하는 것은 아니다. RAM의 backing 영역과 RAM·ROM·MMIO를 배치하는 `MemoryRegion` 및 `AddressSpace`를 구분해야 한다. [CPU 상태](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/cpu.h), [RAMBlock](https://github.com/qemu/qemu/blob/v10.0.0/include/exec/ramblock.h), [QEMU Memory API](https://www.qemu.org/docs/master/devel/memory.html)

## SYSCALL은 진입을, PintOS는 번호를 처리한다

현재 사용자 wrapper의 `write()`는 `syscall3(SYS_WRITE, fd, buffer, size)`를 사용한다. `syscall3`의 3은 인자 개수이며 syscall 번호가 아니다. 번호 `SYS_WRITE`는 10이고, wrapper는 RAX에 번호를, RDI·RSI·RDX에 세 인자를 배치한다. 네 번째부터 여섯 번째 인자는 R10·R8·R9를 사용한다. [PintOS의 사용자 wrapper](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/lib/user/syscall.c)

### CPU가 정한 상태 전환

64비트 코드의 `SYSCALL`은 커널 진입에 필요한 CPU 상태를 바꾼다. 다음 표는 명령의 효과를 나누어 적은 것이며, 각 행을 독립된 Guest 명령 다섯 개로 실행한다는 뜻은 아니다.

| 상태 | 64비트 SYSCALL의 효과 |
|---|---|
| RCX | **SYSCALL 다음 명령의 RIP**를 복귀 주소로 저장 |
| R11 | 복귀에 사용할 RFLAGS 저장; QEMU v10.0.0 경로는 RF를 제거한 값을 저장 |
| RIP | IA32_LSTAR의 커널 진입점으로 이동 |
| CS·SS | IA32_STAR의 커널 selector를 바탕으로 Ring 0 selector와 정해진 descriptor cache 속성을 설정 |
| 현재 RFLAGS | IA32_FMASK에 지정된 비트를 지움; 해당 QEMU 경로는 RF도 제거 |
| RSP | 명령 자체가 User RSP를 저장하거나 Kernel RSP로 교체하지 않음 |
| RAX | PintOS의 syscall 번호라는 의미로 해석하거나 반환값으로 바꾸지 않음 |

QEMU v10.0.0의 `helper_syscall(env, next_eip_addend)`는 `env->eip + next_eip_addend`를 RCX에 저장한다. “현재 RIP를 그대로 복사한다”는 의사 코드는 이 복귀 위치를 놓친다. 함수가 놓인 경로도 `target/i386/tcg/system/seg_helper.c`다. 같은 파일 이름의 다른 경로를 혼동하지 않는다. [QEMU의 system-mode SYSCALL 구현](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/system/seg_helper.c#L30-L83)

PintOS의 `syscall_init()`은 LSTAR에 `syscall_entry`를 등록하고 FMASK로 IF·TF·DF·IOPL·AC·NT를 지우도록 설정한다. 진입한 assembly가 User RSP를 보관하고 TSS에서 Kernel RSP를 읽은 다음 `intr_frame`을 쌓는다. 즉 **CPU의 진입 동작과 커널 코드의 스택 교체**는 서로 다른 단계다. [초기화](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/syscall.c), [진입 assembly](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/userprog/syscall-entry.S)

### Guest 커널의 번호 해석

PintOS의 `syscall_handler()`는 저장된 번호를 구현 함수로 연결한다. 번호·인자·반환값, 미구현 분기와 사용자 버퍼 검사는 [시스템 콜](/wiki/computer-systems-network-topic-3cc26725c1cb/)에서 코드와 함께 다룬다. QEMU의 system emulation은 이 Guest 코드를 실행하며, Guest의 번호 체계를 대신 정하지 않는다.

## Thread를 고르는 자료구조와 CPU 상태

PintOS의 `ready_list`에 여러 Thread가 기다리면 `schedule()`은 `next_thread_to_run()`으로 다음 Thread를 고른다. 선택한 Thread의 상태를 `THREAD_RUNNING`으로 바꾸고 `thread_ticks`를 초기화한다. USERPROG 빌드에서는 `process_activate(next)`가 주소 공간과 TSS를 준비하고, 필요한 경우 `thread_launch(next)`가 저장된 실행 문맥으로 전환한다. [현재 schedule](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/thread.c)

| PintOS의 값 | 커널에서 쓰는 의미 | 가상 CPU·메모리에서 나타나는 변화 |
|---|---|---|
| `thread->tid`, `status` | 실행 단위의 식별자와 상태 | 구조체 필드의 읽기·쓰기 |
| `ready_list`, `thread->elem` | 실행 후보의 순서와 연결 | 포인터와 List 연결의 변경 |
| `child_status_list`, `self_status` | 부모·자식 관계와 종료 상태 | 공유 상태 레코드의 생성·갱신·회수 |
| `thread->pml4` | 사용할 주소 공간의 페이지 테이블 | CR3에 페이지 테이블의 Guest 물리 주소를 설정 |
| `thread->tf`, Kernel Stack | 중단한 실행을 이어 갈 문맥 | RIP·RSP와 일반 레지스터 등의 변경 |

QEMU의 CPU 실행 경로가 이 필드들을 PintOS의 프로세스 테이블로 등록하는 것은 아니다. `fork()` 때 자식 Thread·페이지 테이블·파일 참조가 생성되더라도 QEMU에 대응하는 자식 Host 프로세스를 하나씩 만드는 방식이 아니다. `exit()`의 상태 전달과 `wait()`의 회수 역시 PintOS의 상태 레코드와 동기화가 담당한다. 자세한 복제·회수는 [프로세스 생성](/wiki/computer-systems-network-topic-4af2e32913a4/)과 [프로세스 종료](/wiki/computer-systems-network-topic-93ebb5bf7e48/)로 이어진다.

`struct thread` 전체를 4,096바이트라고 쓰는 것도 정확하지 않다. 이 PintOS는 Thread 구조체와 Kernel Stack을 한 4KiB 페이지 안에 둔다. 구조체를 제외한 나머지 공간을 스택이 쓰므로, 구조체의 크기와 페이지 크기를 구분해야 한다. 빌드 옵션에 따라 필드도 달라지며, `elem`이 구조체의 첫 필드라는 보장도 없다. [Thread 배치](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/include/threads/thread.h)

### CR3는 프로세스 번호가 아니다

`process_activate(next)`는 `pml4_activate(next->pml4)`와 `tss_update(next)`를 호출한다. `thread->pml4`는 커널이 접근하는 가상 주소이고 CR3의 페이지 테이블 기준 주소는 Guest 물리 주소다. NULL인 커널 Thread 경로에는 기본 커널 페이지 테이블을 사용한다. 두 값을 비교할 때 주소 종류와 호출 전후의 시점을 함께 확인해야 한다.

CR3 변경을 관찰하면 CPU가 사용할 페이지 테이블 기준이 달라졌는지 조사할 수 있다. 하지만 그 값으로 PID·tid, 부모·자식 관계, 스케줄링 이유까지 알 수는 없다. 여러 Thread가 같은 주소 공간을 사용할 수 있고, 같은 주소 공간을 다시 활성화할 수도 있다. CPU의 TLB 무효화 범위도 아키텍처·제어 비트와 명령 조건에 따르므로 CR3를 쓸 때마다 모든 TLB가 무조건 사라진다고 일반화하지 않는다. [PintOS의 페이지 테이블 활성화](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/mmu.c)

## 타이머와 페이지 폴트는 결정을 요청한다

PintOS는 PIT에 주기를 설정하고 PIC를 통해 들어온 타이머 인터럽트를 `timer_interrupt()`에서 받는다. 현재 `TIMER_FREQ`는 100이며 설정 코드는 `(1193180 + TIMER_FREQ/2) / TIMER_FREQ`를 정수 계산해 카운터 값을 정한다. 기본값에서는 11,932다. 이는 프로그램한 주기의 계산이며, Host 벽시계에서 정확히 10ms마다 handler가 실행됐다는 측정값이 아니다.

handler는 `ticks`를 늘리고 `thread_tick()`과 깨울 Thread의 처리를 이어 간다. `TIME_SLICE=4`에 따른 선점 요청과 `intr_yield_on_return()`은 Guest 커널의 결정이다. PIT가 “tid 2를 실행하라”고 알려 주는 것은 아니다. 직렬 포트와 키보드 모델도 장치의 레지스터·데이터·인터럽트를 다루며, 이를 fd 1의 출력이나 fd 0의 입력으로 사용하는 규칙은 커널의 I/O 경로에서 생긴다. [타이머](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/devices/timer.c), [Thread의 틱 처리](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/threads/thread.c)

### 주소 변환과 복구 정책

Guest 가상 주소를 페이지 테이블로 변환하는 것은 CPU의 MMU와 TLB에 관한 동작이다. 물리 메모리 영역을 RAM이나 장치에 연결하는 메모리 컨트롤러의 역할과 동일하지 않다. TCG에서는 CPU의 변환·접근 검사를 에뮬레이션하고, KVM에서는 하드웨어 가상화와 Host 커널이 해당 경로에 참여한다. Guest 물리 주소 역시 Host 가상 주소나 Host 물리 주소와 구별한다.

이 PintOS의 일반 4KiB 매핑에서는 네 단계의 페이지 테이블을 따른다. 부팅 초기 `start.S`가 2MiB 페이지를 쓰는 구간과는 구별한다. 매핑이 없거나 접근 권한을 위반하면 CPU는 페이지 폴트 `#PF`를 발생시킬 수 있다. 그러나 매핑이 없다는 사실만으로 OS 버그가 확정되지는 않는다. Lazy Loading, Swap In, Stack Growth, COW 등은 폴트를 계기로 필요한 상태를 만드는 정상 경로를 포함한다. `vm_try_handle_fault()`가 접근과 복구 가능성을 판단하며, 복구하지 못한 경우에 종료나 오류 처리를 이어 간다.

폴트가 요구하는 판단과 실제 매핑이 어떻게 연결되는지는 [가상 메모리 구현](/wiki/computer-systems-network-topic-83f24986336f/)에서 읽는다. Guest VA·PA와 커널 별칭의 계산은 [Paging](/wiki/computer-systems-network-topic-dbd836d1a044/)으로 연결한다. 장치 모델이 주소에 반응하는 동작과 OS가 그 페이지를 유효하다고 판단하는 정책을 함께 확인해야 원인을 좁힐 수 있다.

## Guest의 물리 주소를 Host 메모리에 연결한다

PintOS의 PTE에 들어 있는 물리 주소는 **Guest Physical Address(GPA)**다. QEMU 프로세스 안의 포인터인 Host Virtual Address(HVA)와도, Host OS가 관리하는 물리 주소(HPA)와도 다르다. Guest가 RAM에 접근하는 TCG 경로에서는 Guest VA를 GPA로 번역하고, QEMU가 그 GPA의 영역을 Host 메모리에 연결한다. 마지막 Host VA의 변환은 Host OS와 CPU가 담당한다. 물리 주소 공간에는 장치 영역도 있으므로 PA를 언제나 DRAM의 위치라고 읽을 수는 없다.

`palloc_get_page(PAL_USER)`가 반환하는 Kernel VA, PTE에 넣는 GPA, 프로세스가 사용하는 User VA의 관계는 [Paging](/wiki/computer-systems-network-topic-dbd836d1a044/)의 두 VA 예제에서 확인할 수 있다. 그 계산에 QEMU의 RAMBlock을 더할 때는 먼저 GPA가 **어느 영역으로 번역되는지** 찾아야 한다.

### RAMBlock의 offset은 GPA의 시작 주소가 아니다

| 구성 요소 | 표현하는 것 |
|---|---|
| `AddressSpace` | CPU나 장치가 바라보는 주소 공간 |
| `MemoryRegion` | RAM·ROM·MMIO, Container와 Alias 등 주소 영역의 구성 |
| `FlatView` | Alias와 중첩·우선순위 등을 반영해 현재 보이는 영역 |
| `RAMBlock` | RAM 등을 담는 Host 메모리의 backing과 관리 정보 |

QEMU v10.0.0의 `RAMBlock`은 `host`, `offset`, `used_length`, `max_length`, `mr`, `flags` 등을 가진다. `offset`은 QEMU 내부 RAM 주소 관리에서 사용하는 위치다. Guest 물리 주소 공간에 그 Block이 놓이는 시작 주소와 같다고 가정하면 안 된다. 같은 backing의 일부를 서로 다른 GPA에 Alias로 노출할 수도 있다. [RAMBlock 정의](https://github.com/qemu/qemu/blob/v10.0.0/include/exec/ramblock.h), [메모리 영역과 Alias](https://www.qemu.org/docs/master/devel/memory.html)

일반 RAM의 Host 포인터는 최종 Region을 찾은 뒤 **`block->host + Block 내부 offset`**으로 계산한다. `qemu_ram_ptr_length()`가 Block 포인터를 받으면 전달받은 offset을 그 Block 안에서 해석한다. Block 포인터가 NULL인 경로는 내부 RAM 주소로 Block을 찾고 `block->offset`을 뺀다. 따라서 Guest PA에서 RAMBlock의 `offset`을 바로 빼는 디버깅 스크립트는 Alias와 영역 배치를 놓친다. [Host 포인터 계산](https://github.com/qemu/qemu/blob/v10.0.0/system/physmem.c#L2394), [`ramblock_ptr()`](https://github.com/qemu/qemu/blob/v10.0.0/include/exec/ram_addr.h#L89)

PC 머신의 `pc_memory_init()`도 RAM backing과 Guest 배치를 구분한다. 아래쪽 RAM과 4 GiB 위 RAM을 Alias로 연결하는 경로가 있으며, 위쪽 Alias의 backing offset은 아래쪽 RAM 크기에서 시작한다. VGA·ROM·장치 영역과 Firmware의 예약 영역까지 있으므로 `-m 128M`을 ‘GPA 0부터 128 MiB까지 전부 할당 가능한 RAM’이라고 바꾸어 읽을 수 없다. PintOS의 Pool은 Firmware 정보와 Kernel이 사용한 범위를 고려해 정한다. [PC의 RAM Alias와 E820 정보](https://github.com/qemu/qemu/blob/v10.0.0/hw/i386/pc.c#L887)

### RAM을 확보하는 방식과 메모리 사용량

일반적인 RAM 할당 경로의 `qemu_ram_alloc()`은 `qemu_ram_alloc_internal()`로 내려간다. 내부에서 크기와 정렬, backing 방식과 플래그를 정하고 `ram_block_add()`로 등록한다. 이미 제공한 Host 포인터, 파일·공유 메모리, 익명 메모리 등 경로가 다르다. 이를 언제나 동일한 인자의 `mmap()` 한 번이라고 설명할 수는 없다. [RAM 할당과 등록](https://github.com/qemu/qemu/blob/v10.0.0/system/physmem.c#L2142)

`used_length`와 `max_length`는 사용 중인 길이와 최대 backing 길이를 구별한다. 후자가 더 크다는 사실만으로 Guest의 hotplug나 NUMA 구성이 완성되지는 않는다. 장치·머신 구성과 Guest 지원도 필요하다. RAMBlock마다 Host 메모리의 backing을 관리하는 것과 Linux의 buddy allocator가 Frame을 할당하는 것은 단위와 책임이 다르다.

마찬가지로 설정한 Guest RAM 크기와 QEMU의 RSS는 같은 값이 아니다. Host의 페이지 확보·공유·회수 정책과 아직 접근하지 않은 메모리, QEMU 코드와 장치의 추가 메모리가 관계된다. 특정 실행의 RSS나 TCG·KVM의 Cycle 비용은 측정 없이 정할 수 없다.

### address_space_rw는 어느 주소를 읽는가

QEMU v10.0.0의 `address_space_rw(as, addr, attrs, buf, len, is_write)`에서 `addr`는 선택한 `as`의 주소이고 `buf`는 Host 버퍼다. CPU가 보는 물리 메모리뿐 아니라 장치가 보는 DMA 주소 공간에도 메모리 API가 쓰인다. IOMMU가 있으면 장치의 주소를 다른 공간으로 번역할 수도 있다. x86의 Port I/O는 `address_space_io`를 사용하므로 PintOS의 모든 IDE·PIT·PIC 접근을 MMIO라고 묶지 않는다. [AddressSpace의 관점](https://www.qemu.org/docs/master/devel/memory.html), [x86 Port I/O helper](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/system/misc_helper.c)

이 버전의 `address_space_rw()`는 쓰기일 때 `address_space_write()`, 읽기일 때 `address_space_read_full()`을 호출한다. 이후 FlatView에서 Region과 그 내부 위치를 구한다. 한 요청이 영역 경계를 넘으면 남은 범위를 다시 번역해 처리한다. MMIO 접근은 장치가 지원하는 크기·정렬·Byte Order도 고려한다. [읽기·쓰기의 실제 분기](https://github.com/qemu/qemu/blob/v10.0.0/system/physmem.c#L2920)

직접 접근할 수 있는 RAM의 읽기는 Host 버퍼로 복사하고, 쓰기는 backing에 복사한 뒤 QEMU의 dirty tracking과 코드 무효화 처리를 한다. 일반 ROM 읽기와 ROM device 쓰기는 같은 경로가 아니며, Debug 접근에는 ROM 쓰기를 허용하는 별도 조건도 있다. `mr->ram` 하나만으로 모든 읽기·쓰기의 효과를 결정할 수는 없다. 장치 callback의 실패나 연결되지 않은 영역은 `MemTxResult`로 전달된다. 이 결과가 Guest에서 어떤 예외나 장치 동작으로 나타나는지는 호출 경로까지 확인해야 한다. [직접 접근의 조건](https://github.com/qemu/qemu/blob/v10.0.0/include/exec/memory.h#L3015)

`address_space_map()`은 선택한 주소 공간의 일부에 접근할 Host 포인터를 얻는다. 직접 접근 가능한 RAM이면 backing의 포인터를 돌려주지만, 그 밖의 경로에서는 임시 Bounce Buffer를 사용할 수 있다. 반환값을 언제나 RAM의 별칭으로 해석해서는 안 된다. 요청보다 짧은 범위만 제공하거나 자원 부족으로 NULL을 반환할 수 있으므로, 포인터와 갱신된 `plen`을 함께 확인한다. [Mapping의 반환 경로](https://github.com/qemu/qemu/blob/v10.0.0/system/physmem.c#L3385-L3454)

사용을 마치면 같은 `AddressSpace`와 포인터, 반환된 길이로 `address_space_unmap()`을 호출하고, `access_len`에는 실제 읽거나 쓴 길이를 전달한다. 쓰기 Mapping이면 직접 RAM의 dirty 상태를 반영하거나 Bounce Buffer의 내용을 주소 공간에 다시 쓴다. 이 API는 읽기 또는 쓰기 한 방향으로 사용하며, 같은 Mapping에서 값을 읽고 수정하는 read-modify-write 용도로 쓰지 않는다. [Map·Unmap 계약](https://github.com/qemu/qemu/blob/v10.0.0/include/exec/memory.h#L2923-L2953), [쓰기 반영과 자원 반환](https://github.com/qemu/qemu/blob/v10.0.0/system/physmem.c#L3456-L3493)

### 영역의 배치와 실제 조회 구조를 구별한다

`MemoryRegion.addr`는 부모 안에서의 상대 위치다. Alias를 거쳐 다른 영역을 바라보거나, 같은 부모의 영역이 겹치면 최종 주소 해석에 offset과 우선순위가 반영된다. 높은 우선순위의 Container 안에 빈 구간이 있으면 그 아래 우선순위의 영역이 보일 수 있다. 우선순위는 같은 부모의 자식끼리 비교하는 값이지 전체 트리에서 통용되는 순위가 아니다. [영역의 중첩과 가시성](https://github.com/qemu/qemu/blob/v10.0.0/docs/devel/memory.rst)

최종 배치를 나타내는 FlatView와 매 접근에 사용하는 조회 구조도 구별한다. 이 버전의 `address_space_lookup_region()`은 최근 사용한 Section을 확인하고, 필요하면 `phys_page_find()`의 다단계 Dispatch 구조를 탐색한다. 하위 페이지의 영역을 다시 고르는 경로도 있다. FlatView의 영역 수만으로 접근 때의 비교 횟수를 계산할 수 없는 이유다. [주소를 Section으로 찾는 과정](https://github.com/qemu/qemu/blob/v10.0.0/system/physmem.c#L310)

장치 callback의 크기는 `MemoryRegionOps`의 두 조건을 함께 읽는다. `valid`는 장치가 허용하는 접근 크기·정렬이고, `impl`은 callback 구현이 처리하는 크기·정렬이다. 큰 요청은 여러 callback으로 나뉠 수 있으므로 C Wrapper 호출 수와 장치 callback 횟수가 다를 수 있다. Port I/O와 MMIO의 명령·폭은 [장치](/wiki/computer-systems-network-topic-d38307e3894c/)에서 비교한다. [MMIO callback의 접근 조건](https://github.com/qemu/qemu/blob/v10.0.0/docs/devel/memory.rst#mmio-operations)

실제 배치는 QEMU Monitor의 `info mtree`, `info mtree -f`, `info mtree -f -d`로 각각 트리·FlatView·Dispatch 구조를 나누어 볼 수 있다. QEMU 프로세스에 Host Debugger를 연결한 상태와 Guest GDB Stub에 연결한 상태를 구별한다. `-S`는 Guest CPU 실행을 멈추므로, 그 옵션만으로 이미 끝난 Host의 장치 생성 과정을 처음부터 관찰할 수 있는 것은 아니다. [Monitor의 메모리 트리 옵션](https://github.com/qemu/qemu/blob/v10.0.0/hmp-commands-info.hx#L229)


### 두 주소에서 같은 backing을 바꿔 본다

다음 모형은 RAM 32바이트를 만들고 세 Region을 연결한다. `0x2000`과 `0x3000`의 두 Region은 같은 backing의 offset 16부터 8바이트를 공유한다. `0x4000`의 쓰기는 장치 callback을 흉내 내어 별도 List에 기록한다. HVA는 계산을 보여 주는 가상의 기준값이며 실제 Python 버퍼의 주소가 아니다.

```run-python
ram = bytearray(range(32))
host_base = 0x600000000000
# (guest start, length, offset inside the one RAM backing)
regions = [(0x1000, 8, 0), (0x2000, 8, 16), (0x3000, 8, 16)]
device_writes = []

def resolve(gpa):
    for start, length, backing_offset in regions:
        if start <= gpa < start + length:
            offset = backing_offset + gpa - start
            return offset, host_base + offset
    raise LookupError('not mapped to RAM')

def write_byte(gpa, value):
    assert 0 <= value <= 255
    if gpa == 0x4000:
        device_writes.append(value)
        return 'MMIO callback'
    offset, _ = resolve(gpa)
    ram[offset] = value
    return 'RAM'

for gpa in (0x1003, 0x2003, 0x3003):
    offset, hva = resolve(gpa)
    print(f'GPA={gpa:#x}: backing_offset={offset}, HVA={hva:#x}')
assert resolve(0x2003) == resolve(0x3003)
print('write through first alias:', write_byte(0x2003, 90))
print('read through second alias:', ram[resolve(0x3003)[0]])
assert ram[19] == 90
print('device write:', write_byte(0x4000, 65), device_writes)
assert device_writes == [65] and ram[19] == 90
try:
    resolve(0x2008)
except LookupError:
    print('exclusive region end: rejected')
else:
    raise AssertionError('the region end must be outside RAM')
```

Python 3.9.6에서 실행한 결과다.

```text
GPA=0x1003: backing_offset=3, HVA=0x600000000003
GPA=0x2003: backing_offset=19, HVA=0x600000000013
GPA=0x3003: backing_offset=19, HVA=0x600000000013
write through first alias: RAM
read through second alias: 90
device write: MMIO callback [65]
exclusive region end: rejected
```

GPA가 다른 `0x2003`과 `0x3003`은 같은 offset 19로 연결된다. 한쪽에서 쓴 90을 다른 쪽에서 읽는 까닭이다. `0x4000`의 값은 RAM에 쓰지 않고 장치 List에 남는다. 이 예제는 최종 Region이 이미 정해진 단순 Mapping이며, QEMU의 전체 FlatView·IOMMU·동시 접근을 구현하지는 않는다.

### TCG와 KVM에서 재사용하는 주소 변환

TCG의 직접 RAM 접근은 Software TLB에 저장한 정보를 재사용해 Guest VA에 `addend`를 더한 Host 포인터로 접근할 수 있다. 매번 `address_space_rw()`나 전체 Page Table Walk를 실행하는 경로가 아니다. MMU index, 접근 종류와 느린 경로로 보낼 조건도 함께 읽는다. v10.0.0의 TLB 크기는 동적으로 조절되므로 ‘항상 256 Entry’라는 상수로 설명하지 않는다. [TCG의 TLB와 직접 접근](https://github.com/qemu/qemu/blob/v10.0.0/accel/tcg/cputlb.c)

Guest의 CR3 쓰기는 `helper_write_crN() → cpu_x86_update_cr3()`로 이어진다. 이 버전은 Guest Paging이 켜져 있으면 `env->cr[3]`를 바꾸고 `tlb_flush()`를 호출한다. Host 하드웨어 TLB를 모두 비운다는 뜻이 아니며, 번역된 명령을 담는 TB Cache와도 구분한다. [Guest CR3의 갱신](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/helper.c#L173)

KVM의 일반적인 userspace RAM 등록은 Guest 물리 범위와 Host 가상 메모리를 연결한다. Intel EPT나 AMD NPT를 사용하는 환경에서는 CPU가 Guest 변환과 두 번째 단계의 변환을 수행한다. Guest의 각 메모리 접근이 QEMU의 C 함수에서 HVA를 계산하는 것은 아니다. 실제 장치·공유 메모리·가속 설정에 따라 경로를 더 구분해야 한다. [KVM의 메모리 등록 API](https://www.kernel.org/doc/html/latest/virt/kvm/api.html#kvm-set-user-memory-region)

### 관찰할 대상부터 고른다

Guest GDB에서는 PintOS의 PTE와 CR3, `kpage`를 읽는다. `kpage - KERN_BASE`가 GPA이고, 실제 프레임과 Pool의 유효 범위까지 함께 확인해야 한다. 함수 진입 주소에 1을 더한 Breakpoint를 반환 직후라고 가정하거나, User RSP를 `struct thread *`로 바로 읽지 않는다. 일반 Register와 저장된 Frame의 선택은 [Debugger](/wiki/platform-delivery-operations-topic-f89d71c7eb29/)에서 이어진다.

RAMBlock 자체를 보려면 해당 QEMU 빌드의 심볼로 **Host 프로세스**를 디버깅해야 한다. 모든 Host Thread를 정지한 상태에서 v10.0.0의 List를 읽는 절차는 다음과 같다. 실제 실행 결과를 첨부한 명령은 아니다.

```gdb
set $rb = ram_list.blocks.lh_first
while $rb != 0
  printf "name=%s host=%p offset=%#llx used=%#llx max=%#llx\n", $rb->idstr, $rb->host, (unsigned long long)$rb->offset, (unsigned long long)$rb->used_length, (unsigned long long)$rb->max_length
  set $rb = $rb->next.le_next
end
```

`mru_block`은 가장 최근에 참조한 Block을 기억하는 필드이며 List의 머리가 아니다. 이 목록만으로 GPA를 HVA로 번역할 수 없으므로, `flatview_read_continue_step()`·`flatview_write_continue_step()`에서 `mr`, `mr_addr`, `mr->ram_block`을 함께 조사한다. 생성 과정은 `qemu_ram_alloc_internal()`·`ram_block_add()`, TCG의 변환 실패와 보충은 `x86_cpu_tlb_fill()`에서 이어진다. 최적화로 변수가 보이지 않으면 해당 빌드의 소스와 Disassembly를 함께 읽는다. [RAMList 정의](https://github.com/qemu/qemu/blob/v10.0.0/include/exec/ramlist.h), [x86 TLB 보충](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/system/excp_helper.c)

QEMU Monitor의 `info tlb`도 이름만 보고 Software TLB의 적중 항목을 출력한다고 해석해서는 안 된다. v10.0.0의 x86 구현은 현재 CR3에서 Guest Page Table을 읽어 Mapping을 출력한다. 실제 TLB Hit 비율이나 Cache에 남은 항목 수를 측정한 결과가 아니다. Guest 물리 바이트는 Monitor의 `xp` 등 물리 조회 경로로 확인하며, 기본 Guest GDB의 `x`가 읽는 가상 주소와 구분한다. [Monitor의 Page Table 조회](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/monitor.c#L140), [QEMU GDB의 주소 공간](https://www.qemu.org/docs/master/system/gdb.html#examining-physical-memory)

## 파일 이름이 Sector 요청으로 바뀌는 지점

`filesys_open("hello.txt")`를 처리할 때 PintOS는 Directory의 이름을 찾아 inode를 열고, 파일 안의 위치를 데이터 Sector로 바꾼다. 현재 기본 파일 시스템의 연속 할당 경로는 `inode->data.start + offset / DISK_SECTOR_SIZE`를 사용한다. 파일 길이 안의 유효한 offset인지도 커널이 검사한다. [파일 시스템 구현](https://github.com/woonyong-kr/lrn-pintos/blob/5afaa6dc2f7e38f6178cc8fcecad8989518f2eb0/pintos/filesys/inode.c)

inode가 Sector 5에 있고 첫 데이터 Sector가 40인 설명용 배치를 생각할 수 있다. 파일 offset 1,024는 `40 + 1024/512 = 42`에 대응한다. inode Metadata가 놓인 5와 데이터 위치 42는 서로 다르다. `disk_read()` 아래의 IDE 요청에는 장치·Sector·명령·데이터가 전달되며, 이 요청에 `hello.txt`를 찾는 Directory 탐색이 포함되는 것은 아니다.

현재 Driver는 LBA28의 번호를 Low·Mid·High 및 Device Register에 나누고, Read `0x20` 또는 Write `0x30` 명령을 쓴다. Primary Channel의 Data Port는 `0x1f0`, Secondary는 `0x170`이며 512바이트 Sector를 16비트 Word 256개로 전송한다. 장치 선택과 IRQ·PIO 대기 순서는 [IDE 컨트롤러](/wiki/ide-controller/)에서 이어서 확인한다.

### Guest 파일 정책과 Host 파일 정책은 별도로 존재한다

Guest의 기본 파일 시스템은 `dir_lookup()`으로 이름을 찾고, free map으로 빈 Sector를 추적하고, `inode_disk.length`로 길이를 관리한다. `deny_write_cnt`는 실행 중 파일 등에 적용하는 쓰기 금지 요청 수다. 이것이 Linux의 uid·gid·mode 같은 일반적인 사용자별 접근 권한 모델을 구현한 것은 아니다. 현재 PintOS의 이런 구조는 [파일 시스템 구현](/wiki/computer-systems-network-topic-c76b83867c50/)과 [저장 공간 관리](/wiki/computer-systems-network-topic-33acdcc0a664/)에서 구체적으로 읽을 수 있다.

QEMU의 일반 블록 장치 경로는 Guest 파일의 이름·소유자·디렉터리·빈 블록을 그 파일 시스템의 의미로 관리하지 않는다. 디렉터리나 텍스트 파일에 들어 있는 문자열 바이트가 전송될 수는 있어도, 그것을 Guest 파일의 이름으로 해석해 접근을 허가하는 절차는 아니다. Guest Linux에서도 VFS·파일 시스템이 경로·inode·권한·저널과 캐시를 관리하고 아래 블록 계층에 요청을 넘긴다.

반면 QEMU는 **Host의 이미지 파일 경로와 이미지 형식**을 알고 파일을 연다. Host 파일 시스템의 접근 권한과 Cache도 영향을 준다. `-virtfs`·9p처럼 Host 디렉터리를 Guest에 제공하는 기능에서는 QEMU가 이름과 파일 속성을 직접 처리한다. Virtual FAT처럼 Host 디렉터리에서 파일 시스템 이미지를 구성하는 기능도 있다. 따라서 “QEMU 소스 전체에 filename·directory·permission 개념이 없다”거나 “QEMU는 파일 이름을 본 적이 없다”고 주장할 수 없다. [9p 공유 설정](https://www.qemu.org/docs/master/system/invocation.html), [QEMU 9p의 Host 경로 처리](https://github.com/qemu/qemu/blob/v10.0.0/hw/9pfs/9p-local.c), [Virtual FAT](https://www.qemu.org/docs/master/system/images.html#virtual-fat-disk-images)

Guest 파일 캐시와 QEMU 블록 계층의 Cache 설정, Host Page Cache는 각각 다르다. Guest가 `disk_write()`를 완료했다는 사실만으로 Host 전원 손실 뒤에도 바이트가 남는다고 판단하지 않는다. [BlockBackend](/wiki/qemu-block-backend/)에서 이미지 경로와 완료·영속성의 차이를 이어서 확인할 수 있다.

### Raw 이미지의 직접 오프셋은 조건이 있다

이미지 전체를 기준 오프셋 없이 연결한 Raw 구성이라면 Sector 42의 데이터는 이미지 파일의 `42*512 = 21,504`, 즉 `0x5400`에서 시작한다. 512바이트 범위는 21,504 이상 22,016 미만이다. qcow2는 Cluster 매핑과 Metadata를 거치므로 같은 숫자를 Host 파일 오프셋으로 그대로 사용할 수 없다. Raw에서도 연결한 offset과 backing 구성을 확인해야 한다.

QEMU의 `ide_sector_read()`는 장치 상태를 처리하고 `ide_buffered_readv()`·`blk_aio_preadv()`를 거쳐 요청한다. 아래의 Format·Protocol Driver가 실제 저장소를 다룬다. `file-posix.c`에서도 설정에 따라 비동기 I/O나 Thread Pool 등으로 갈 수 있으므로 “IDE가 항상 `pread()` 한 번만 한다”고 줄이지 않는다. 이 내부 경로와 Raw·qcow2 비교는 [BlockBackend](/wiki/qemu-block-backend/)에서 자세히 다룬다. [QEMU IDE 읽기](https://github.com/qemu/qemu/blob/v10.0.0/hw/ide/core.c)

2MiB 장치와 512바이트 논리 Sector를 **가정하면** 총 4,096개 Sector다. 기본 PintOS 파일 시스템은 Sector 0을 Free Map 파일의 inode, Sector 1을 Root Directory inode에 사용한다. free map의 4,096비트 데이터는 512바이트지만 inode 등 Metadata 비용은 별도다. FAT 빌드의 배치까지 같다고 볼 수는 없다. 이 크기를 모든 실행의 기본 디스크 크기나 `pintos.dsk`라는 고정 파일 이름으로 일반화하지 않는다.

같은 방식으로 4MiB Swap 장치에 4KiB 페이지를 저장하면 1,024개 Slot을 둘 수 있고, 한 페이지는 512바이트 Sector 여덟 개에 해당한다. 어느 Slot을 예약·회수하고 어떤 페이지를 복구할지는 PintOS의 [Swap](/wiki/computer-systems-network-swap-11630540adf8/) 코드가 판단한다. QEMU가 `swap_table`을 검사해 빈 Slot을 골라 주는 것은 아니다. 실행기의 Boot·파일 시스템·Scratch·Swap 이미지 연결은 BlockBackend 문서의 장치 표와 실제 `-drive` 인자를 대조한다.

## 같은 중단점에서 무엇을 관찰할 것인가

Guest Kernel Symbol을 사용하는 원격 GDB와 QEMU 자체의 Host Debugger는 서로 다른 프로그램을 읽는다. Guest GDB에서 `syscall_handler()`를 볼 수 있다는 사실이 QEMU의 `ide_sector_read()`까지 같은 Symbol로 볼 수 있다는 뜻은 아니다. Guest 코드와 디버그 정보가 같은 빌드인지, 어느 vCPU와 주소 공간을 선택했는지도 먼저 확인한다. [QEMU GDB의 CPU·메모리 관찰](https://www.qemu.org/docs/master/system/gdb.html)

다음은 Kernel Symbol이 있는 해당 PintOS에 연결한 뒤 사용할 **정적 관찰 절차**다. 실행 출력은 제시하지 않는다. 각 묶음은 필요한 함수에서 멈춰 사용하는 절차다. 다른 중단점에 먼저 멈췄다면 현재 함수를 확인하고 해당 지점까지 진행한 뒤 변수를 읽는다. 코드 위치나 지역 변수의 가시성은 실제 빌드에서 확인한다.

```gdb
# syscall_handler에 저장된 사용자 인자를 읽는다.
tbreak syscall_handler
continue
p/x f->R.rax
p f->R.rdi
p/x f->R.rsi
p f->R.rdx

# 다음 Thread와 현재 CPU 상태를 비교한다.
tbreak process_activate
continue
p next->tid
p next->status
p/x next->pml4
info registers cr3 rip rsp

# 페이지 폴트의 접근 주소와 실패한 명령을 구별한다.
tbreak page_fault
continue
p/x $cr2
p/x f->error_code
p/x f->rip
```

`process_activate()` 입구에서는 새 CR3를 아직 쓰기 전일 수 있다. source를 따라 `pml4_activate()` 이후를 확인해야 선택한 Thread와 실제 페이지 테이블을 비교할 수 있다. `page_fault()`에서는 CR2를 다른 폴트로 덮기 전에 읽거나, `fault_addr = rcr2()`가 끝난 뒤 저장된 지역 변수를 읽는다. RCX는 fault 주소 레지스터가 아니며, PTE 하나의 존재 여부만으로 접근이 성공해야 한다고 판단할 수도 없다. 상위 단계 권한, 접근 종류, 현재 주소 공간과 복구 경로를 함께 본다.

### List 원소에서 Thread를 찾는다

`ready_list`의 포인터는 `struct thread`의 시작이 아니라 내부의 `elem`을 가리킨다. 원소 주소에서 실제 필드 오프셋을 빼야 Thread 주소가 된다. 다음은 스케줄러 안에서 멈춘 상태에 사용할 설명용 GDB 절차이며, 함수 호출로 Guest를 실행하지 않고 디버그 타입과 저장된 연결을 읽는다.

```gdb
set $thread_elem_offset = (unsigned long)&((struct thread *)0)->elem
set $ready_entry = ready_list.head.next
set $seen = 0
while $ready_entry != &ready_list.tail && $ready_entry != 0 && $seen < 64
  set $ready_thread = (struct thread *)((char *)$ready_entry - $thread_elem_offset)
  p $ready_thread->tid
  p $ready_thread->status
  p $ready_thread->priority
  set $ready_entry = $ready_entry->next
  set $seen = $seen + 1
end
```

64는 무한 순회를 피하기 위한 관찰 상한이며 Thread 수의 제한이 아니다. 상한 전에 tail에 닿지 않았다고 곧바로 순환 버그라고 단정하지 않는다. 또한 `x/4x`의 단위를 바이트로 가정하거나 임의 주소의 첫 네 바이트를 tid라고 지정하지 않는다. 타입을 읽을 때는 `p`, 실제 바이트를 확인할 때는 검증한 주소에 `x/4bx`처럼 단위를 명시한다.

| 증상 | 먼저 관찰할 값과 경로 | 그 관찰만으로 확정할 수 없는 것 |
|---|---|---|
| syscall 반환값 이상 | 저장된 번호·인자, handler 분기, fd·버퍼 검증과 하위 반환값 | QEMU 전체의 정상 여부나 미구현 번호의 성공 |
| Thread가 실행되지 않음 | `ready_list`, 상태·우선순위, `thread_tick()`, `schedule()` | vCPU가 존재한다는 사실만으로 Guest 스케줄링이 정상이라는 결론 |
| 페이지 폴트 | CR2, `f->rip`, error code, 페이지 테이블·SPT, 복구 handler | PTE가 없으면 반드시 버그라는 결론 |
| 디스크 내용 불일치 | 장치·Sector·버퍼, 연결한 이미지·Format·offset, 완료 시점 | 읽힌 바이트만으로 저장 장치의 영속성이나 모든 계층의 정상 여부 |
| 타이머 이상 | PIT·PIC 설정, IF, `timer_interrupt()` 진입과 `ticks` 변화 | handler가 한 번 호출되면 주파수·누락·지연까지 정상이라는 결론 |

fd table을 조사할 때도 먼저 fd 범위와 예약된 표준 입력·출력 번호를 확인한 뒤 파일 슬롯을 읽는다. 타이머에서는 중단점 방문 수와 가상 시간·Host 벽시계 시간을 구분한다. 관찰한 Guest 요청이 올바른데 장치 응답이 다르면 QEMU의 Machine·accelerator·장치·Backend 경로로 조사를 넓힌다. 책임 경계는 원인을 찾는 순서를 정해 주지만, 측정 없이 “99%는 OS 버그”라는 확률을 주지는 않는다.

## GDB에 전달할 CPU 상태를 만드는 과정

GDB에서 `info registers`를 실행했을 때 보이는 Guest RAX가 Host CPU의 RAX와 같은 저장소라고 생각하면 TCG를 읽기 어렵다. Guest 명령을 번역한 Host 코드가 실행되는 동안에는 Guest 값이 Host Register나 임시 값으로 다뤄질 수 있다. QEMU는 Guest 상태를 관찰하거나 복원해야 하는 경계에서 그 값과 `CPUX86State`의 표현을 맞춘다. 모든 명령마다 구조체 전체를 저장하거나, 모든 TB의 마지막에 한 번만 저장한다는 고정 규칙으로 설명하지 않는다.

### 구조체의 필드와 CPU의 상태

다음은 QEMU v10.0.0의 x86 상태에서 서로 다른 역할을 맡는 필드다. 구조체 전체를 줄여 복제한 C 선언이 아니라, 소스에서 찾아갈 항목을 비교한 표다. `target_ulong`의 크기는 QEMU의 Target 빌드 조건을 따르며 Guest가 현재 실행하는 명령의 operand 크기와 같아야 하는 것은 아니다. [CPUX86State 정의](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/cpu.h)

| 필드 | 담는 상태와 읽을 때의 조건 |
|---|---|
| `regs[]` | Target의 GPR; 이 버전의 x86-64 일반 Register 배열은 16개 |
| `eip` | 실행 위치; 필드 이름에 `e`가 있어도 x86-64 빌드에서는 64 Bit 값을 담음 |
| `eflags` | Flag 표현; TCG 실행 중에는 아래 지연 계산 상태와 함께 읽어야 함 |
| `cc_src`, `cc_src2`, `cc_dst`, `cc_op` | 필요한 산술 Flag를 재구성할 값과 연산 종류 |
| `df` | String 명령 방향의 내부 표현; DF가 0이면 1, DF가 1이면 -1 |
| `segs[]` | Selector뿐 아니라 Base·Limit·속성을 포함한 Segment Cache |
| `cr[]` | CR0·CR2·CR3·CR4; 배열의 CR1 위치는 사용하지 않음 |
| `efer`, `star`, `lstar`, `fmask` | 실행 모드와 syscall 진입 설정에 관계된 MSR |
| `hflags`, `hflags2` | 번역과 실행에 사용하는 QEMU 내부 상태; 독립된 하드웨어 Register가 아님 |
| `fpregs`, `xmm_regs`, `mxcsr` | 부동소수점·Vector 상태; MXCSR는 32 Bit이며 Vector 저장 형식과 크기가 다름 |

`SegmentCache`의 Selector를 출력한 값과 구조체의 메모리 크기는 다른 문제다. 컴파일 조건과 정렬도 구조체 크기에 영향을 준다. Guest 물리 주소 역시 `CPUX86State` 뒤에 바로 이어지는 RAM offset이 아니다. 앞서 설명한 `AddressSpace`와 `MemoryRegion`을 통해 실제 backing 영역을 찾아야 한다.

### 지연된 Flag가 관찰 가능한 값이 된다

TCG는 연산마다 모든 Flag를 계산하는 대신 필요한 입력과 연산 종류를 남길 수 있다. 이 버전의 `x86_cpu_exec_enter()`는 산술 Flag와 DF를 내부 표현으로 옮기고, `x86_cpu_exec_exit()`는 `cpu_compute_eflags()`로 Flag 값을 다시 만든다. 따라서 실행 도중 Host Debugger에서 `env->eflags` 필드 하나만 읽은 값은 Guest GDB에 전달되는 완성된 Flag와 다를 수 있다. [TCG 진입·이탈 코드](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/tcg/tcg-cpu.c)

공통 GDB Stub의 `handle_read_all_regs()`는 선택한 CPU에 `cpu_synchronize_state()`를 호출한 뒤 Register callback들을 순서대로 호출한다. x86 callback의 Flag 분기는 준비된 `env->eflags`를 읽는다. “GDB callback이 직접 모든 지연 Flag를 계산한다”는 설명은 이 둘 사이의 실행·동기화 단계를 빠뜨린다. [공통 Register 읽기](https://github.com/qemu/qemu/blob/v10.0.0/gdbstub/gdbstub.c), [x86 callback](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/gdbstub.c)

KVM에서는 실행 상태의 동기화에 Linux KVM API가 관여한다. QEMU v10.0.0의 `kvm_getput_regs()` 읽기 경로는 `KVM_GET_REGS` ioctl로 값을 가져와 `env`에 옮긴다. 이는 `kvm_get_regs`라는 syscall을 부르는 것도, 모든 GPR이 VMCS에 들어 있다는 뜻도 아니다. CPU 상태의 여러 부분은 별도의 KVM API로 처리한다. 실제 비용이나 동기화 빈도는 이 함수 하나의 존재로 계산할 수 없다. [KVM Register 동기화](https://github.com/qemu/qemu/blob/v10.0.0/target/i386/kvm/kvm.c)

### GDB 번호와 regs 배열의 번호

GDB의 Register 1은 RBX지만 `env->regs[1]`은 RCX다. QEMU v10.0.0의 `gpr_map`이 두 순서를 연결한다. 같은 번호를 그대로 배열 index로 쓰면 통신이 성공해도 다른 Register를 표시하게 된다.

| GDB 번호 | 이름 | QEMU 배열 index |
|---:|---|---:|
| 0 | RAX | 0 |
| 1 | RBX | 3 |
| 2 | RCX | 1 |
| 3 | RDX | 2 |
| 4 | RSI | 6 |
| 5 | RDI | 7 |
| 6 | RBP | 5 |
| 7 | RSP | 4 |
| 8–15 | R8–R15 | 8–15 |

RIP는 이 x86-64 Target Description에서 번호 16이고, 별도의 `eip` 필드에서 읽는다. EFLAGS는 32 Bit 형식으로 전송되며 Segment Selector도 해당 XML에서는 32 Bit 형식이다. 이는 PintOS `intr_frame`의 16 Bit Selector와 padding 배치를 그대로 보낸 결과가 아니다. x87·Vector·제어 Register 등의 항목도 있으므로 `g` 응답 전체가 항상 164 Byte라고 가정하지 않는다. [Target Description](https://github.com/qemu/qemu/blob/v10.0.0/gdb-xml/i386-64bit.xml)

다음 모형은 첫 GPR 여덟 개의 순서를 바꾸고 Little Endian Byte를 Hex로 인코딩한다. Packet의 ASCII 길이와 안에 담긴 이진 데이터 크기는 다르다. 네트워크 연결, Target 협상, 실제 QEMU 실행은 하지 않으며 escaping이 필요한 입력은 거부한다.

```run-python
def packet(payload):
    data = payload.encode('ascii')
    if any(value in data for value in b'$#}*'):
        raise ValueError('이 예제는 escaping이 필요 없는 ASCII payload만 처리한다.')
    return f'${payload}#{sum(data) % 256:02x}'


qemu_order = ('rax', 'rcx', 'rdx', 'rbx', 'rsp', 'rbp', 'rsi', 'rdi')
gdb_order = ('rax', 'rbx', 'rcx', 'rdx', 'rsi', 'rdi', 'rbp', 'rsp')
qemu_regs = [0x100 + index for index in range(8)]
gdb_to_qemu = [qemu_order.index(name) for name in gdb_order]
print('GDB 0..7 -> QEMU slot:', gdb_to_qemu)

payload = b''.join(qemu_regs[index].to_bytes(8, 'little') for index in gdb_to_qemu)
rbx = int.from_bytes(payload[8:16], 'little')
print(f'GDB reg 1 RBX=0x{rbx:x}; QEMU slot 1 RCX=0x{qemu_regs[1]:x}')
print(f'8개 GPR 데이터={len(payload)} bytes, hex 문자열={len(payload.hex())} chars')
for command in ('g', 'p10', 'm1000,10'):
    framed = packet(command)
    print(f'{command}: {framed} ({len(framed)} ASCII bytes)')

example_rip = 0x400c28
encoded = example_rip.to_bytes(8, 'little').hex()
print(f'RIP=0x{example_rip:x} -> {encoded} -> 0x{int.from_bytes(bytes.fromhex(encoded), "little"):x}')
print('16-byte memory request:', packet(f'm1000,{16:x}'))
print('16개의 8-byte 값 요청:', packet(f'm1000,{16 * 8:x}'))
try:
    packet('bad#payload')
except ValueError as error:
    print(f'입력 검사: {error}')
```

Python 3.9.6에서 실행해 확인한 결과다.

```text
GDB 0..7 -> QEMU slot: [0, 3, 1, 2, 6, 7, 5, 4]
GDB reg 1 RBX=0x103; QEMU slot 1 RCX=0x101
8개 GPR 데이터=64 bytes, hex 문자열=128 chars
g: $g#67 (5 ASCII bytes)
p10: $p10#d1 (7 ASCII bytes)
m1000,10: $m1000,10#bb (12 ASCII bytes)
RIP=0x400c28 -> 280c400000000000 -> 0x400c28
16-byte memory request: $m1000,10#bb
16개의 8-byte 값 요청: $m1000,80#c2
입력 검사: 이 예제는 escaping이 필요 없는 ASCII payload만 처리한다.
```

RBX는 QEMU 배열의 3번 값인 `0x103`으로 복원된다. `$g#67`의 전체 길이는 5 Byte이고, `p10`의 `10`은 16진수로 쓴 Register 번호다. 아래 두 메모리 요청은 16 Byte와 128 Byte를 요구하므로 끝의 길이 필드도 `10`과 `80`으로 달라진다. Packet 계산 규칙과 GDB 관찰 절차는 [Debugger](/wiki/platform-delivery-operations-topic-f89d71c7eb29/)에서 이어서 확인한다.

### 메모리 읽기는 Register 읽기와 경로가 다르다

공통 Stub의 `handle_read_mem()`은 주소와 길이를 해석해 `gdb_target_memory_rw_debug()`에 전달한다. System mode의 기본 가상 주소 경로는 CPU별 Debug Memory callback이나 `cpu_memory_rw_debug()`를 사용한다. `qemu.PhyMemMode`로 물리 주소 모드를 선택하면 `cpu_physical_memory_read()` 경로로 달라진다. 두 경우의 숫자를 같은 주소로 해석해서는 안 된다. [Memory 요청 처리](https://github.com/qemu/qemu/blob/v10.0.0/gdbstub/gdbstub.c), [가상·물리 Debug 경로](https://github.com/qemu/qemu/blob/v10.0.0/gdbstub/system.c)

Debug Memory 읽기는 Guest 코드가 Load 명령을 실행하는 과정과 다르다. Debugger에서 읽혔다고 Guest의 동일 주소 접근에 필요한 권한이 모두 만족됐다고 결론 내리지 않는다. 반대로 매핑되지 않은 주소를 Debugger가 읽는다고 Guest의 Lazy Loading handler가 실행되어 페이지를 채워 주는 것도 아니다. 이 경로의 실패 응답과 실제 Guest Page Fault를 구별해야 한다.

## 정지 원인과 관찰 도구의 경계

QEMU GDB Stub의 Thread 목록은 Guest OS의 `tid` 목록과 동일하지 않다. vCPU와 CPU Cluster의 노출 방식을 먼저 확인하고, PintOS Thread는 Guest의 구조체와 Scheduler 자료에서 찾는다. Host QEMU를 Debugger로 읽는 경우에는 그 프로세스의 Symbol과 주소를 사용한다. Linux Guest 안의 kgdb 역시 그 커널을 대상으로 하는 별도 연결이며, 언제나 Host 커널만 조사하는 도구는 아니다.

Breakpoint나 Single-step의 처리 방식은 accelerator와 Target 지원에 따라 달라진다. TCG의 Breakpoint를 모든 경우에 Guest Byte `0xcc` 삽입으로 설명하거나, `stepi`를 일반적인 TB 하나의 실행이라고 설명하지 않는다. QEMU의 GDB Single-step에는 IRQ와 Timer를 어떻게 다룰지 정하는 설정도 있다. 멈춘 결과가 원래 실행과 다른 시간 흐름을 만들 수 있으므로 타이머 횟수나 지연을 측정할 때 이 조건을 기록한다. [QEMU GDB의 CPU 선택과 Single-step](https://www.qemu.org/docs/master/system/gdb.html)

QEMU v10.0.0의 `check_for_breakpoints_slow()`는 현재 PC의 정확한 Breakpoint와 같은 Page에 있는 Breakpoint를 구별한다. 같은 Page이면 `CF_NO_GOTO_TB | CF_BP_PAGE`와 한 명령의 실행 경계를 사용해 실제 주소에 도달했는지 다시 확인한다. 등록 즉시 해당 주소의 모든 TB를 반드시 무효화한다는 설명과 다르다. 이 동작을 모든 accelerator의 구현으로 확장하지 않는다. [TCG의 Breakpoint 검사](https://github.com/qemu/qemu/blob/v10.0.0/accel/tcg/cpu-exec.c)

GDB가 보고한 `SIGTRAP`은 중단 이유를 전달하는 Protocol 상태다. `SIGSEGV`를 보았다고 PintOS의 Page Fault vector 14와 바로 대응시키지 않는다. 어느 Target이 어떤 Stop Reply를 보냈는지와 Guest handler의 실제 실행을 함께 확인한다. Register의 값이 낯설 때에는 Packet, 선택한 CPU, 현재 Frame, 저장된 Guest Frame 중 어느 단계에서 그 값이 만들어졌는지부터 좁힌다.
