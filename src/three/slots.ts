export type RoomSlotId = 'shelfWall' | 'notesWall' | 'desk';

export interface SlotDimensions {
  width: number;
  height: number;
}

export interface SlotComponent {
  mount(container: HTMLElement): void;
  unmount(): void;
  refresh(): void;
  getDimensions(): SlotDimensions;
}

interface PlaceholderConfig {
  title: string;
  subtitle: string;
  className?: string;
  width?: number;
  height?: number;
  items?: string[];
}

export function createPlaceholderSlotComponent(config: PlaceholderConfig): SlotComponent {
  const width = config.width ?? 1200;
  const height = config.height ?? 760;
  let containerRef: HTMLElement | null = null;

  return {
    mount(container: HTMLElement) {
      containerRef = container;
      const itemsMarkup = (config.items || [])
        .map((item) => `<li class="three-slot-card">${escapeHtml(item)}</li>`)
        .join('');

      container.innerHTML = `
        <section class="three-slot ${config.className || ''}">
          <header class="three-slot-head">
            <h3>${escapeHtml(config.title)}</h3>
            <p>${escapeHtml(config.subtitle)}</p>
          </header>
          <ul class="three-slot-grid">${itemsMarkup}</ul>
        </section>
      `;
    },

    unmount() {
      if (containerRef) containerRef.innerHTML = '';
      containerRef = null;
    },

    refresh() {
      // Placeholder has no reactive data yet.
    },

    getDimensions() {
      return { width, height };
    },
  };
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
