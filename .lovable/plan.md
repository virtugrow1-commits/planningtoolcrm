

## Plan: Zijpanelen sticky maken bij scrollen

De sidebar (Element toevoegen) en het eigenschappenpaneel scrollen nu mee met de pagina omdat de parent container `overflow-hidden` heeft. De sidebars hebben al `sticky top-0` classes maar die werken niet door de overflow-instelling.

### Wat er verandert

**Bestand: `src/components/template-editor/BlockEditor.tsx`** (regel 107)
- De buitenste container `overflow-hidden` vervangen door `overflow-visible`
- De scroll alleen op het middelste canvas-gedeelte houden (regel 162, die heeft al `overflow-y-auto`)
- De sidebars (BlockSidebar en BlockPropertiesPanel) krijgen een `max-h-[calc(100vh-200px)]` zodat ze binnen het viewport passen en hun eigen interne scroll behouden

**Bestand: `src/components/template-editor/BlockSidebar.tsx`**
- `h-screen max-h-screen` vervangen door een viewport-relatieve hoogte die past binnen de editor context

**Bestand: `src/components/template-editor/BlockPropertiesPanel.tsx`**
- Zelfde aanpassing als BlockSidebar

### Technisch

Het kernprobleem is dat `overflow: hidden` op de parent `sticky` positioning breekt. Door overflow alleen op het canvas-deel toe te passen en de sidebars met `position: sticky; top: 0` te laten werken, blijven ze zichtbaar bij het scrollen.

