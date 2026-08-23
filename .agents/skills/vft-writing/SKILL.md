---
name: vft-writing
description: >-
  Tone and geoscientific reasoning guidelines for RockHopper VFT markdown and
  educational tour text. Use whenever drafting or rewriting .md tour content,
  site narratives, help/notebook pages, quizzes, figure captions, or other
  visitor-facing geoscience explanations. Always ask the user for target
  audience before writing if not already specified.
---

# VFT writing (tone & geoscientific reasoning)

Use this skill for **visitor-facing markdown** in a virtual field trip. Technical edits to JSON/Python/JS without prose still benefit from checking whether new user-visible strings need this skill.

## Required first step — confirm audience

If the user has not already stated the audience for this text, **ask before drafting**. Offer these options exactly:

1. **General public**
2. **Secondary college** (upper secondary / high-school level)
3. **Undergraduate**
4. **Postgraduate**
5. **Geoscience community** (practitioners and researchers)

Do not invent an audience. If the task mixes levels (e.g. public intro + specialist appendix), confirm which level each section targets.

## Universal tone (all audiences)

Always write **simple, friendly, and clear**:

- Conversational but respectful — like a good field guide, not a textbook lecture or a marketing page
- Short paragraphs; one idea per paragraph
- Prefer concrete field observations and “what you can see here” over abstract catalogues of terms
- Invite exploration (questions, look-here prompts, light quizzes) without condescension
- British or consistent local spelling as already used in the tour; match existing tour voice when editing

**Adapt terminology and depth** to the chosen audience (below). The *manner* stays simple and friendly; the *density of jargon and assumed knowledge* changes.

## Audience adaptations

### i. General public

- Almost no unexplained jargon; if a term is needed, define it in plain language on first use
- Everyday analogies are welcome when accurate
- Focus on “what am I looking at?” and “why does it matter?”
- Avoid equations, mineral formulae, and citation-heavy asides unless essential — then keep them optional

### ii. Secondary college

- Introduce standard school-level earth-science terms with brief definitions
- Link processes to visible evidence in the outcrop/cloud/photosphere
- Light scaffolding: short “check your understanding” quizzes are appropriate
- Avoid assuming university coursework (petrology, structural analysis methods, etc.)

### iii. Undergraduate

- Use core geoscience vocabulary (e.g. bedding, foliation, phenocryst, unconformity) after a brief reminder if the tour is introductory
- Separate **observation** from **interpretation** explicitly
- Can include simple process diagrams in prose, unit-bearing numbers, and named rock types
- Citations sparingly in-body; fuller references belong in a References tab

### iv. Postgraduate

- Assume fluency with core methods and literature context; still keep sentences clear
- Emphasise uncertainty, alternative interpretations, and what evidence would discriminate them
- Technical terms OK without hand-holding; define only niche or contested usage
- Suitable place for quantitative constraints, stratigraphic/structural detail, and “open questions”

### v. Geoscience community

- Professional field-trip note style: precise, evidence-led, still readable
- Standard community terminology without dilution; expand acronyms once
- Interpretations framed with respect to published frameworks where relevant
- Include enough locality, unit, and observational detail for a colleague to reuse or critique
- Tone remains friendly and clear — not stiff or performatively dense

## Geoscientific reasoning guidelines

1. **Lead with what is visible** in this site’s media (cloud colours, contacts, morphology), then interpret.
2. **Label certainty**: observation → interpretation → speculation. Never present a model as fact without signalling.
3. **Do not fabricate** ages, assays, thicknesses, citations, or locality facts. Use `[PLACEHOLDER]` or ask the user.
4. **Scale and orientation** matter: say whether a feature is centimetres or kilometres; note if the view is exaggerated or coloured by a non-RGB style.
5. **Process over name-dropping**: prefer “lava cooled quickly at the surface, forming glass” over stacking unused jargon.
6. **Local narrative arc**: each site page should have a takeaway the visitor can carry to the next stop.
7. **Accessibility of media cues**: when referring to a colour style, highlight group, or annotation, name it as the UI does.

## Markdown practices for VFT prose

- Use headings that match the learning beat (`## What you can see`, `## Interpretation`, …) rather than generic “Overview”
- Figure/image alt text **is** the caption — write it carefully
- Quizzes: one clear stem; mark the correct option with `- [x]`; keep distractors plausible for the audience level
- Embed audio/video only when they earn their place; introduce them in one sentence
- Keep language-suffix files in sync conceptually when translating (`_en`, `_de`, …); do not leave English idioms untranslated in other locales

## Workflow reminder

1. Confirm audience (and site/page purpose) if unknown  
2. Draft in the tour’s markdown path conventions (`md/..._{lang}.md`)  
3. Keep JSON/structure changes minimal unless the user also asked for new tabs/sites  
4. If rewriting, preserve interactive elements (links to `#sites`, quizzes, embeds) unless asked to change them  
