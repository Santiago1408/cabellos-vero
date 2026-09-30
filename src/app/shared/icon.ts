import { Component, input } from '@angular/core';

@Component({
  selector: 'app-icon',
  standalone: true,
  template: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    @switch (name()) {
      @case ('home') { <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/> }
      @case ('box') { <path d="m3 7 9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/> }
      @case ('chart') { <path d="M4 20V10m5 10V4m5 16v-7m5 7V8M2 20h20"/> }
      @case ('users') { <circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 5v1"/> }
      @case ('truck') { <path d="M3 5h11v12H3zM14 9h4l3 3v5h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/> }
      @case ('store') { <path d="M3 10h18l-2-6H5zM5 10v10h14V10M9 20v-6h6v6"/> }
      @case ('settings') { <circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/> }
      @case ('logout') { <path d="M10 4H4v16h6M14 7l5 5-5 5m5-5H8"/> }
      @case ('search') { <circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/> }
      @case ('bell') { <path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9M10 21h4"/> }
      @case ('plus') { <path d="M12 4v16M4 12h16"/> }
      @case ('filter') { <path d="M3 5h18M6 11h12M9 17h6"/> }
      @case ('download') { <path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/> }
      @case ('edit') { <path d="m4 16 11-11 4 4-11 11-5 1zM13 7l4 4"/> }
      @case ('menu') { <path d="M3 6h18M3 12h18M3 18h18"/> }
      @case ('close') { <path d="M5 5 19 19M19 5 5 19"/> }
      @case ('chevron') { <path d="m9 5 7 7-7 7"/> }
      @case ('arrow') { <path d="M4 12h16m-7-7 7 7-7 7"/> }
      @case ('package') { <path d="M4 4h16v16H4zM8 4v5h8V4"/> }
      @case ('alert') { <path d="m12 3 10 18H2zM12 9v5m0 3h.01"/> }
      @case ('check') { <path d="m4 12 5 5L20 6"/> }
      @case ('wallet') { <path d="M3 6h15a2 2 0 0 1 2 2v11H5a2 2 0 0 1-2-2zM3 8V5a2 2 0 0 1 2-2h12v3M15 11h6v5h-6a2.5 2.5 0 0 1 0-5z"/> }
    }
  </svg>`,
  styles: [':host{display:inline-flex;width:20px;height:20px;flex:none}svg{width:100%;height:100%}']
})
export class Icon { name = input.required<string>(); }
