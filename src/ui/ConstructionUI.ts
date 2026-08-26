import {
    COMMISSION,
    FIXTURE,
    PLAN_INDEX,
    type OptionId,
    type PlanId,
    type Result,
} from '../construction/content.js';
import type { ConstructionErrorCode, ConstructionViewModel } from '../construction/ConstructionSystem.js';
import { playUiClick } from './Audio.js';

type GameLike = {
    runtimeMode: string;
    nightMode: boolean;
    constructionView: ConstructionViewModel;
    confirmConstructionSite(): Result<true, ConstructionErrorCode>;
    selectConstructionPlan(planId: PlanId): Result<unknown, ConstructionErrorCode>;
    beginConstruction(): Result<unknown, ConstructionErrorCode>;
    setConstructionPaused(paused: boolean): Result<unknown, ConstructionErrorCode>;
    setConstructionSpeed(speed: 1 | 2): Result<unknown, ConstructionErrorCode>;
    skipConstructionPhase(): Result<unknown, ConstructionErrorCode>;
    resolveConstructionIntervention(optionId: OptionId): Result<unknown, ConstructionErrorCode>;
    replayConstruction(): Result<unknown, ConstructionErrorCode>;
    stopConstructionReplay(): Result<unknown, ConstructionErrorCode>;
    ui?: { showToast(text: string, ms?: number): void };
};

export class ConstructionUI {
    private readonly game: GameLike;
    private readonly root: HTMLDivElement;
    private readonly launch: HTMLButtonElement;
    private readonly rail: HTMLElement;
    private readonly timeline: HTMLElement;
    private readonly intervention: HTMLElement;
    private readonly passport: HTMLElement;
    private readonly recovery: HTMLElement;
    private open = false;
    private passportOpen = false;
    private lastSignature = '';

    constructor(game: GameLike) {
        this.game = game;
        this.root = document.createElement('div');
        this.root.id = 'construction-ui';
        this.root.setAttribute('aria-label', 'HYPATIA living construction');

        this.launch = document.createElement('button');
        this.launch.type = 'button';
        this.launch.className = 'chronicle-launch';
        this.launch.innerHTML = '<span class="chronicle-mark">H</span><span><strong>Memory Commission</strong><small>Rebuild a home</small></span>';
        this.launch.addEventListener('click', () => {
            playUiClick();
            this.open = true;
            this.update(true);
        });

        this.rail = document.createElement('aside');
        this.rail.className = 'construction-rail';
        this.rail.setAttribute('aria-label', 'Commission and architectural plans');

        this.timeline = document.createElement('nav');
        this.timeline.className = 'construction-timeline';
        this.timeline.setAttribute('aria-label', 'Construction phases');

        this.intervention = document.createElement('section');
        this.intervention.className = 'construction-intervention';
        this.intervention.setAttribute('aria-label', 'Architectural decision');

        this.passport = document.createElement('aside');
        this.passport.className = 'building-passport';
        this.passport.setAttribute('aria-label', 'Building passport');

        this.recovery = document.createElement('div');
        this.recovery.className = 'construction-recovery';
        this.recovery.setAttribute('role', 'alert');
        this.recovery.hidden = true;

        this.root.append(this.launch, this.rail, this.timeline, this.intervention, this.passport, this.recovery);
        document.body.appendChild(this.root);
        this.update(true);
    }

    update(force = false): void {
        const vm = this.game.constructionView;
        const decision = vm.record?.decisionEvents[0]?.optionId ?? '';
        const signature = [
            vm.status,
            vm.selectedPlanId ?? '',
            vm.phaseIndex,
            vm.paused,
            vm.playbackSpeed,
            decision,
            this.open,
            this.passportOpen,
            this.game.runtimeMode,
        ].join('|');
        if (force || signature !== this.lastSignature) {
            this.lastSignature = signature;
            this.renderRail(vm);
            this.renderTimeline(vm);
            this.renderIntervention(vm);
            this.renderPassport(vm);
        }
        const progress = vm.phase?.progress ?? 0;
        const bar = this.timeline.querySelector<HTMLElement>('.phase-progress-fill');
        if (bar) bar.style.width = `${Math.round(progress * 100)}%`;
        const progressEl = this.timeline.querySelector<HTMLElement>('[role="progressbar"]');
        progressEl?.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
        this.launch.hidden = this.open || vm.status !== 'idle';
    }

    private makeButton(label: string, className: string, onClick: () => void): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = className;
        button.textContent = label;
        button.addEventListener('click', () => {
            playUiClick();
            onClick();
        });
        return button;
    }

    private accept<T>(result: Result<T, ConstructionErrorCode>): boolean {
        if (result.ok) {
            this.recovery.hidden = true;
            this.recovery.replaceChildren();
            return true;
        }
        this.recovery.hidden = false;
        this.recovery.innerHTML = `<strong>Construction paused safely</strong><span>${result.message}</span>`;
        this.game.ui?.showToast(result.message, 2400);
        return false;
    }

    private renderRail(vm: ConstructionViewModel): void {
        this.rail.replaceChildren();
        this.rail.hidden = !this.open || ['building', 'awaiting-intervention', 'completed', 'replay'].includes(vm.status);
        if (this.rail.hidden) return;

        const close = this.makeButton('Close', 'construction-close', () => {
            this.open = false;
            this.update(true);
        });
        close.setAttribute('aria-label', 'Close commission panel');

        const eyebrow = document.createElement('div');
        eyebrow.className = 'drafting-eyebrow';
        eyebrow.textContent = 'MEMORY COMMISSION 01';
        const title = document.createElement('h2');
        title.textContent = COMMISSION.title;
        const quote = document.createElement('blockquote');
        quote.textContent = `“${COMMISSION.memory}”`;
        const fiction = document.createElement('small');
        fiction.className = 'fiction-label';
        fiction.textContent = COMMISSION.subtitle;
        const brief = document.createElement('p');
        brief.textContent = COMMISSION.brief;
        this.rail.append(close, eyebrow, title, quote, fiction, brief);

        if (vm.status === 'idle') {
            const review = this.makeButton('Review riverside site', 'construction-primary', () => {
                if (this.accept(this.game.confirmConstructionSite())) this.update(true);
            });
            this.rail.append(review);
            return;
        }

        const site = document.createElement('div');
        site.className = 'site-fact';
        site.innerHTML = `<span>CURATED SITE</span><strong>${FIXTURE.w}×${FIXTURE.d} · faces Nile · road west · palm preserved</strong>`;
        this.rail.append(site);

        const planHeading = document.createElement('h3');
        planHeading.textContent = 'Choose an authored plan';
        this.rail.append(planHeading);

        const group = document.createElement('div');
        group.className = 'plan-list';
        group.setAttribute('role', 'radiogroup');
        group.setAttribute('aria-label', 'Architectural plans');
        for (const plan of vm.plans) {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'plan-row';
            row.dataset.planId = plan.id;
            row.setAttribute('role', 'radio');
            row.setAttribute('aria-checked', String(vm.selectedPlanId === plan.id));
            row.innerHTML = `<strong>${plan.name}</strong><span>${plan.tags.map((tag) => `<em>${tag}</em>`).join('')}</span>`;
            const choose = () => {
                if (this.accept(this.game.selectConstructionPlan(plan.id))) this.update(true);
            };
            row.addEventListener('click', choose);
            row.addEventListener('focus', choose);
            group.append(row);
        }
        this.rail.append(group);

        if (vm.status === 'plan-selected') {
            const selected = vm.selectedPlanId ? PLAN_INDEX[vm.selectedPlanId] : null;
            const begin = this.makeButton(`Begin ${selected?.name ?? 'construction'}`, 'construction-primary begin-construction', () => {
                if (this.accept(this.game.beginConstruction())) {
                    this.open = false;
                    this.update(true);
                }
            });
            this.rail.append(begin);
        }
    }

    private renderTimeline(vm: ConstructionViewModel): void {
        this.timeline.replaceChildren();
        const active = ['building', 'awaiting-intervention', 'completed', 'replay'].includes(vm.status);
        this.timeline.hidden = !active;
        if (!active) return;

        const phaseNames = ['Survey', 'Foundation', 'Structure', 'Walls', 'Fit-out', 'Open'];
        const phases = document.createElement('div');
        phases.className = 'phase-markers';
        phaseNames.forEach((name, index) => {
            const marker = document.createElement('span');
            marker.className = index < vm.phaseIndex ? 'done' : index === vm.phaseIndex ? 'active' : '';
            marker.textContent = name;
            phases.append(marker);
        });
        const progress = document.createElement('div');
        progress.className = 'phase-progress';
        progress.setAttribute('role', 'progressbar');
        progress.setAttribute('aria-label', vm.phase ? `${vm.phase.label}, phase ${vm.phaseIndex + 1} of 6` : 'Construction complete');
        progress.setAttribute('aria-valuemin', '0');
        progress.setAttribute('aria-valuemax', '100');
        progress.innerHTML = '<span class="phase-progress-fill"></span>';

        const controls = document.createElement('div');
        controls.className = 'construction-controls';
        if (vm.status === 'completed') {
            controls.append(
                this.makeButton('Building passport', 'timeline-button', () => {
                    this.passportOpen = true;
                    this.update(true);
                }),
                this.makeButton('Replay construction', 'timeline-button', () => {
                    if (this.accept(this.game.replayConstruction())) this.update(true);
                }),
            );
        } else if (vm.status === 'replay') {
            controls.append(this.makeButton('Stop replay', 'timeline-button', () => {
                if (this.accept(this.game.stopConstructionReplay())) this.update(true);
            }));
        } else if (vm.status === 'awaiting-intervention') {
            const required = document.createElement('strong');
            required.className = 'decision-required';
            required.textContent = 'Decision required above — construction is safely paused';
            controls.append(required);
        } else {
            controls.append(
                this.makeButton(vm.paused ? 'Resume' : 'Pause', 'timeline-button', () => {
                    if (this.accept(this.game.setConstructionPaused(!vm.paused))) this.update(true);
                }),
                this.makeButton('1×', `timeline-button ${vm.playbackSpeed === 1 ? 'active' : ''}`, () => {
                    if (this.accept(this.game.setConstructionSpeed(1))) this.update(true);
                }),
                this.makeButton('2×', `timeline-button ${vm.playbackSpeed === 2 ? 'active' : ''}`, () => {
                    if (this.accept(this.game.setConstructionSpeed(2))) this.update(true);
                }),
                this.makeButton('Next phase', 'timeline-button', () => {
                    if (this.accept(this.game.skipConstructionPhase())) this.update(true);
                }),
            );
        }
        this.timeline.append(phases, progress, controls);
    }

    private renderIntervention(vm: ConstructionViewModel): void {
        this.intervention.replaceChildren();
        this.intervention.hidden = vm.status !== 'awaiting-intervention' || !vm.intervention;
        if (this.intervention.hidden || !vm.intervention) return;
        const eyebrow = document.createElement('div');
        eyebrow.className = 'drafting-eyebrow';
        eyebrow.textContent = 'WALLS COMPLETE · ARCHITECT NOTE';
        const title = document.createElement('h2');
        title.textContent = vm.intervention.prompt;
        const options = document.createElement('div');
        options.className = 'intervention-options';
        options.setAttribute('role', 'radiogroup');
        options.setAttribute('aria-label', vm.intervention.prompt);
        for (const option of vm.intervention.options) {
            const button = this.makeButton(option.label, 'intervention-option', () => {
                if (this.accept(this.game.resolveConstructionIntervention(option.id))) this.update(true);
            });
            button.setAttribute('role', 'radio');
            button.setAttribute('aria-checked', 'false');
            const detail = document.createElement('small');
            detail.textContent = option.description;
            button.append(detail);
            options.append(button);
        }
        this.intervention.append(eyebrow, title, options);
        queueMicrotask(() => options.querySelector<HTMLButtonElement>('button')?.focus());
    }

    private renderPassport(vm: ConstructionViewModel): void {
        this.passport.replaceChildren();
        this.passport.hidden = !this.passportOpen || !vm.completed || !vm.record;
        if (this.passport.hidden || !vm.record) return;
        const plan = PLAN_INDEX[vm.record.approvedPlanId];
        const choice = plan.interventions.find((entry) => entry.id === vm.record?.decisionEvents[0]?.optionId);
        const close = this.makeButton('Close', 'construction-close', () => {
            this.passportOpen = false;
            this.update(true);
        });
        const eyebrow = document.createElement('div');
        eyebrow.className = 'drafting-eyebrow';
        eyebrow.textContent = 'BUILDING PASSPORT · OPENED AT SUNSET';
        const title = document.createElement('h2');
        title.textContent = COMMISSION.title;
        const fiction = document.createElement('small');
        fiction.className = 'fiction-label';
        fiction.textContent = COMMISSION.subtitle;
        const memory = document.createElement('section');
        memory.innerHTML = `<h3>Memory</h3><blockquote>“${COMMISSION.memory}”</blockquote>`;
        const decision = document.createElement('section');
        decision.innerHTML = `<h3>Decision</h3><p>${choice?.label ?? 'Original plan preserved'} · ${plan.name}</p>`;
        const life = document.createElement('section');
        life.innerHTML = `<h3>New life</h3><p>${COMMISSION.residents.join(', ')} returned home at sunset.</p>`;
        const actions = document.createElement('div');
        actions.className = 'passport-actions';
        actions.append(this.makeButton('Replay construction', 'construction-primary', () => {
            this.passportOpen = false;
            if (this.accept(this.game.replayConstruction())) this.update(true);
        }));
        this.passport.append(close, eyebrow, title, fiction, memory, decision, life, actions);
        queueMicrotask(() => close.focus());
    }
}
