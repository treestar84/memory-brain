---
replay_for: bmad-brainstorming
generated_at: 2026-05-06T12:43:59.995Z
ssl_version: 0.3.0
status: ready
---

# Replay Plan: bmad-brainstorming

> **Goal**: Facilitate an interactive brainstorming session that generates 100+ ideas using structured creative techniques and anti-bias domain shifting
>
> **Intent**: Facilitate an interactive brainstorming session
>
> **Trigger patterns**: the user says help me brainstorm or help me ideate, the user requests a structured ideation or brainstorming session

## 실행 방법

이 파일을 읽고 Scene 순서대로 Logical Actions 를 수행한다.
- Decision 은 조건을 평가해 분기한다.
- Interaction 은 사용자에게 발화 후 응답 대기한다.
- Protocol 은 지정된 skill 에 위임한다.
- 각 Scene 완료 후 다음 Scene 으로 이동한다.

---

### Scene: PREPARE — Load configuration and resolve session output paths

**Logical Actions:**
1. `[READ]` Read {project-root}/_bmad/core/config.yaml and resolve project_name, output_folder, user_name, communication_language, document_output_language, user_skill_level, and date
   - Resources: LOCAL_FS
   - Effects: config_values_loaded; communication_language_resolved
2. `[TRANSFORM]` Compute brainstorming_session_output_file = {output_folder}/brainstorming/brainstorming-session-{{date}}-{{time}}.md once at workflow start
   - Resources: MEMORY
   - Effects: output_path_resolved

### Scene: ACQUIRE — Set up the session, detect continuation, and discover techniques

**Logical Actions:**
1. `[BRANCH]` Detect whether the session is a new run or continuation, and branch to step-01-session-setup or step-01b-continue accordingly
   - Resources: LOCAL_FS
   - Effects: session_mode_decided
2. `[READ]` Load brain-methods.csv on demand for technique discovery
   - Resources: LOCAL_FS
   - Effects: technique_catalog_loaded

### Scene: REASON — Select a brainstorming technique by user choice, AI recommendation, random pick, or progressive flow

**Logical Actions:**
1. `[INFER]` Recommend or select a technique based on user choice, AI recommendation, random selection, or progressive flow rules
   - Resources: MEMORY
   - Effects: technique_selected
2. `[BRANCH]` Route to step-02a-user-selected, step-02b-ai-recommended, step-02c-random-selection, or step-02d-progressive-flow based on selection mode
   - Resources: LOCAL_FS
   - Effects: selection_mode_path_taken

### Scene: ACT — Execute the selected technique to generate ideas, shifting creative domain every 10 ideas to maintain divergence

**Logical Actions:**
1. `[EMIT]` Prompt the user with technique-specific questions in the configured communication_language to elicit ideas
   - Resources: MEMORY
   - Effects: prompt_emitted_to_user; user_kept_in_generative_mode
2. `[WRITE]` Append each generated idea to brainstorming_session_output_file using append-only document building
   - Resources: LOCAL_FS
   - Effects: idea_appended_to_session_file; frontmatter_state_updated
3. `[BRANCH]` Every 10 ideas, consciously shift creative domain (technical → UX → business → edge cases) to combat sequential bias and continue toward the 100+ idea quantity goal
   - Resources: MEMORY
   - Effects: creative_domain_shifted; anti_bias_protocol_applied

### Scene: FINALIZE — Organize generated ideas into the session output document and close the session

**Logical Actions:**
1. `[TRANSFORM]` Cluster, deduplicate, and organize generated ideas into thematic groups per step-04
   - Resources: MEMORY
   - Effects: ideas_organized_into_themes
2. `[WRITE]` Write the organized ideas section back to brainstorming_session_output_file and finalize the session document
   - Resources: LOCAL_FS
   - Effects: session_document_finalized

---

## 성공 기준

- [ ] 모든 Logical Actions 완료
- [ ] VERIFY scene 통과
