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

  let selectedIndex = $state(-1);
  let popupRef = $state<HTMLDivElement>();

  function scrollSelected() {
    requestAnimationFrame(() => {
      if (popupRef) scrollSelectedIntoView(popupRef, selectedIndex);
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

    const totalActions = flatActions.length;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        event.stopPropagation();
        selectedIndex = selectedIndex >= totalActions - 1 ? 0 : selectedIndex + 1;
        scrollSelected();
        break;

      case 'Tab':
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) {
          selectedIndex = selectedIndex <= 0 ? totalActions - 1 : selectedIndex - 1;
        } else {
          selectedIndex = selectedIndex >= totalActions - 1 ? 0 : selectedIndex + 1;
        }
        scrollSelected();
        break;

      case 'ArrowUp':
        event.preventDefault();
        event.stopPropagation();
        if (selectedIndex <= 0) {
          selectedIndex = -1; // deselect all; focus stays on input naturally
        } else {
          selectedIndex = selectedIndex - 1;
          scrollSelected();
        }
        break;

      case 'Enter':
        if (selectedIndex >= 0) {
          event.preventDefault();
          event.stopPropagation();
          const currentAction = flatActions[selectedIndex];
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
    selectedIndex = -1;
    const timer = setTimeout(() => {
      popupRef?.querySelector('input')?.focus();
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
            class:action-primary-item={flatIndex === 0}
            class:action-destructive={action.destructive}
          >
            <LauncherListRow
              selected={flatIndex === selectedIndex}
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
    background: color-mix(in srgb, var(--bg-popup) 85%, transparent);
    backdrop-filter: blur(20px);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-popup);
    overflow: hidden;
    z-index: 50;
    outline: none;
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
    background: color-mix(in srgb, var(--bg-popup) 95%, transparent);
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

  .action-primary-item :global(.result-title) {
    font-weight: 600;
    color: var(--accent-primary);
  }

  /* Destructive actions read as red — both label and icon, regardless of
     whether the row is also the primary item. */
  .action-destructive :global(.result-title),
  .action-destructive :global(.result-item > div > div:first-child) {
    color: var(--accent-danger) !important;
  }
</style>
