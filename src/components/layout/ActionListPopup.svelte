<script lang="ts">
  import { logService } from '../../services/log/logService';
  import Input from '../base/Input.svelte';
  import LauncherListRow from '../list/LauncherListRow.svelte';
  import EmptyState from '../feedback/EmptyState.svelte';
  import { actionService } from '../../services/action/actionService.svelte';
  import type { ApplicationAction } from '../../services/action/actionService.svelte';
  import { feedbackService } from '../../services/feedback/feedbackService.svelte';
  import { diagnosticsService } from '../../services/diagnostics/diagnosticsService.svelte';
  import { filterActions } from './actionFilter';
  import { actionUsageStore } from '../../services/action/actionUsageStore';
  import { scrollSelectedIntoView } from '../../lib/listScroll';
  import { useListSelection } from '../../lib/listSelection.svelte';

  let {
    availableActions = [],
    onclose
  }: {
    availableActions?: ApplicationAction[];
    onclose?: () => void;
  } = $props();

  let searchQuery = $state('');

  let filteredForSearch = $derived(filterActions(availableActions, searchQuery));

  let groupedActions = $derived((() => {
    const groups = new Map<string, typeof filteredForSearch>();
    for (const action of filteredForSearch) {
      const cat = (action as any).displayCategory ?? 'Actions';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(action);
    }
    return Array.from(groups.entries()).map(([cat, actions]) => [
      cat,
      actionUsageStore.sortByUsage(actions)
    ] as const);
  })());

  let flatActions = $derived(groupedActions.flatMap(([, actions]) => actions));

  let popupRef = $state<HTMLDivElement>();

  const selection = useListSelection({ items: () => flatActions });

  function scrollSelected() {
    requestAnimationFrame(() => {
      if (popupRef) scrollSelectedIntoView(popupRef, selection.selectedIndex);
    });
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      // Raycast-style chain: clear the popup's search first, then close on the next press.
      if (searchQuery.length > 0) {
        searchQuery = '';
      } else {
        closePopup();
      }
      return;
    }

    if (flatActions.length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
      case 'Tab':
        if (event.key === 'Tab' && event.shiftKey) {
          event.preventDefault();
          event.stopPropagation();
          selection.moveSelection('up');
          scrollSelected();
          break;
        }
        event.preventDefault();
        event.stopPropagation();
        selection.moveSelection('down');
        scrollSelected();
        break;

      case 'ArrowUp':
        event.preventDefault();
        event.stopPropagation();
        selection.moveSelection('up');
        scrollSelected();
        break;

      case 'Enter':
        if (selection.selectedIndex >= 0) {
          event.preventDefault();
          event.stopPropagation();
          const currentAction = selection.selectedItem;
          if (currentAction) handleActionSelect(currentAction.id);
        }
        // selectedIndex === -1: let Enter pass through to the input naturally
        break;
    }
  }

  async function handleActionSelect(actionId: string) {
    logService.debug(`[ActionListPopup] Action selected: ${actionId}`);
    const action = flatActions.find(a => a.id === actionId);
    if (!action) return;

    // Close the popup BEFORE awaiting the confirm dialog so the user can't
    // pick a second action while the dialog is up. The dialog is rendered
    // by the global DialogHost; it doesn't need this popup to stay open.
    closePopup();

    if (action.confirm) {
      const confirmed = await feedbackService.confirmAlert({
        title: 'Confirm Action',
        message: `Are you sure you want to run '${action.label}'? This cannot be undone.`,
        confirmText: 'Confirm',
        variant: 'danger',
      });
      if (!confirmed) return;
    }

    actionUsageStore.record(actionId);
    try {
      await actionService.executeAction(actionId);
      await diagnosticsService.report({
        source: 'frontend',
        kind: 'manual',
        severity: 'success',
        retryable: false,
        context: { message: action.label },
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logService.error(`[ActionListPopup] Failed to execute action ${actionId}: ${error}`);
      await diagnosticsService.report({
        source: 'frontend',
        kind: 'manual',
        severity: 'error',
        retryable: false,
        context: { message: `Failed: ${msg}` },
      });
    }
  }

  function closePopup() {
    logService.debug('[ActionListPopup] Closing popup');
    onclose?.();
  }

  $effect(() => {
    const timer = setTimeout(() => {
      popupRef?.querySelector('input')?.focus({ preventScroll: true });
    }, 50);
    popupRef?.addEventListener('keydown', handleKeydown);
    return () => {
      clearTimeout(timer);
      popupRef?.removeEventListener('keydown', handleKeydown);
      searchQuery = '';
    };
  });
</script>

<div
  bind:this={popupRef}
  class="action-popup"
  tabindex="-1"
  role="dialog"
  aria-modal="true"
  aria-labelledby="action-list-heading"
>
  <h2 id="action-list-heading" class="sr-only">Available Actions</h2>

  <div class="action-scroll custom-scrollbar">
    {#each groupedActions as [category, groupActions], groupIndex}
      <div class="group-section" class:first-group={groupIndex === 0}>
        <div class="list-section">{category}</div>
        {#each groupActions as action}
          {@const flatIndex = flatActions.indexOf(action)}
          <div
            class="action-row"
            class:action-destructive={action.destructive}
          >
            <LauncherListRow
              selected={flatIndex === selection.selectedIndex}
              onclick={() => handleActionSelect(action.id)}
              data-index={flatIndex}
              tabindex="-1"
              icon={action.icon}
              title={action.label}
              shortcut={action.shortcut}
              shortcutPlacement="trailing"
            />
          </div>
        {/each}
      </div>
    {:else}
      <EmptyState message="No matching actions" />
    {/each}
  </div>

  <div class="action-search">
    <Input
      bind:value={searchQuery}
      placeholder="Search for actions..."
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
      spellcheck={false}
    />
  </div>
</div>

<style>
  .action-popup {
    position: fixed;
    bottom: 48px; /* 40px bar height + 8px gap */
    right: 12px;
    width: 340px;
    max-height: 60vh;
    display: flex;
    flex-direction: column;
    /* Translucent surface — rows beneath visibly bleed through, like
       Raycast. Heavy blur keeps content readable despite the low alpha. */
    background: color-mix(in srgb, var(--bg-popup) 70%, transparent);
    backdrop-filter: blur(40px) saturate(180%);
    -webkit-backdrop-filter: blur(40px) saturate(180%);
    border-radius: var(--radius-xl); /* 12px — matches launcher window */
    /* Raycast-style soft elevation: large feathered ambient cast
       weighted slightly downward, plus a tighter contact layer for
       definition near the popup edge. No border. */
    /* Casts to the left (negative X) and slightly down — the popup
       sits in the bottom-right of the launcher, so its shadow falls
       leftward across the visible launcher surface. */
    box-shadow:
      -28px 20px 80px -20px rgba(0, 0, 0, 0.3),
      -14px 10px 40px -16px rgba(0, 0, 0, 0.18),
      -4px 3px 12px -6px rgba(0, 0, 0, 0.1);
    overflow: hidden;
    z-index: 50;
    outline: none;
  }

  /* Forced dark theme */
  :global(html[data-theme="dark"]) .action-popup {
    box-shadow:
      -28px 20px 80px -20px rgba(0, 0, 0, 0.6),
      -14px 10px 40px -16px rgba(0, 0, 0, 0.4),
      -4px 3px 12px -6px rgba(0, 0, 0, 0.25);
  }

  /* OS-tracking dark (no explicit data-theme) */
  @media (prefers-color-scheme: dark) {
    :global(html:not([data-theme])) .action-popup {
      box-shadow:
        -28px 20px 80px -20px rgba(0, 0, 0, 0.6),
        -14px 10px 40px -16px rgba(0, 0, 0, 0.4),
        -4px 3px 12px -6px rgba(0, 0, 0, 0.25);
    }
  }

  .action-scroll {
    flex: 1;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 8px;
  }

  :global(html[data-platform="linux"]) .action-popup {
    backdrop-filter: none;
    background-color: var(--bg-popup);
  }

  .group-section {
    margin-bottom: 4px;
  }

  .group-section:not(.first-group) {
    border-top: 1px solid var(--divider-soft);
    padding-top: 4px;
    margin-top: 4px;
  }

  .action-search {
    padding: 6px 12px;
    border-top: 1px solid var(--divider-soft);
    background: transparent;
  }

  .action-search :global(.input) {
    font-size: var(--font-size-md);
    padding: 4px 0;
    border: none;
    background: transparent;
    border-radius: 0;
  }
  .action-search :global(.input:focus) {
    border: none;
    box-shadow: none;
  }

  .action-row :global(.result-title) {
    font-size: var(--font-size-md);
  }

  /* Inside the actions popup, built-in icons render as flat glyphs in
     the title color — not filled blue tiles. The popup is a secondary
     surface and doesn't need the brand-tile treatment. */
  .action-popup :global(.builtin-icon-tile) {
    background-color: transparent;
    color: var(--text-primary);
  }

  /* Destructive actions read as red — title and icon glyph both. */
  .action-destructive :global(.result-title),
  .action-destructive :global(.builtin-icon-tile) {
    color: var(--accent-danger) !important;
  }
</style>
