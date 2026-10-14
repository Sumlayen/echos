/**
 * The in-game menu, launched on top of the overworld. Tabs for party, items,
 * gear, quests, saving and settings — plus buy/sell tabs when a shop opened
 * it. It closes by emitting `overlay:close`, which the world scene listens for.
 */

import Phaser from 'phaser';
import { sfx } from '../audio/Audio';
import { partyUnit } from '../battle/BattleEngine';
import { gearStats, xpToNext } from '../battle/Damage';
import { BALANCE, SCENES } from '../config/constants';
import { gs } from '../core/GameApp';
import { MAX_LEVEL, type PartyMember } from '../core/GameState';
import { bus } from '../core/EventBus';
import { SaveManager, saves } from '../core/SaveManager';
import { session } from '../core/Session';
import { onStageResize, stage } from '../core/Stage';
import {
  EQUIP_SLOTS,
  ITEMS,
  SHOP_STOCK,
  STAT_KEYS,
  STAT_LABEL,
  type EquipSlot,
  type StatKey
} from '../data/Items';
import { QUESTS, questText } from '../data/Quests';
import { SKILLS } from '../data/Skills';
import { mapDef } from '../data/World';
import { KeyPad, type KeyName } from '../ui/Keys';
import { Label, makeLabel, wrap } from '../ui/Text';
import { SettingsForm } from '../ui/Settings';
import { C, Gauge, MenuList, Panel, icon } from '../ui/Window';

type Tab = 'party' | 'items' | 'gear' | 'quests' | 'save' | 'settings' | 'buy' | 'sell';

const MENU_TABS: Tab[] = ['party', 'items', 'gear', 'quests', 'save', 'settings'];
const SHOP_TABS: Tab[] = ['buy', 'sell'];

const TAB_LABEL: Record<Tab, string> = {
  party: 'PARTY',
  items: 'ITEMS',
  gear: 'GEAR',
  quests: 'QUESTS',
  save: 'SAVE',
  settings: 'SETTINGS',
  buy: 'BUY',
  sell: 'SELL'
};

const SLOT_LABEL: Record<EquipSlot, string> = {
  weapon: 'WEAPON',
  shield: 'SHIELD',
  head: 'HEAD',
  body: 'BODY',
  accessory: 'TRINKET'
};

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface MenuGeo {
  panel: Box;
  list: { x: number; y: number };
  sub: { x: number };
  detail: Box;
  ink: number;
  right: number;
  noteY: number;
  formX: number;
}

/**
 * Menu geometry. The frame fills the stage, the list column is pinned to its
 * left and the detail card to its right — a bigger window buys a wider detail
 * card rather than a small island of text stranded in the corner. The numbers
 * are the 640x360 baseline, so the classic menu is unchanged.
 */
function menuGeo(w: number, h: number): MenuGeo {
  const detailW = Math.max(180, Math.min(358, w - 282));
  const detailX = Math.max(120, w - 32 - detailW);
  return {
    panel: { x: 10, y: 8, w: w - 20, h: h - 16 },
    list: { x: 44, y: 64 },
    sub: { x: detailX + 50 },
    detail: { x: detailX, y: 58, w: Math.max(120, w - 32 - detailX), h: Math.max(120, Math.min(214, h - 146)) },
    ink: detailX + 14,
    right: w - 24,
    noteY: h - 24,
    formX: Math.max(8, Math.round(w / 2 - 150))
  };
}

export class OverlayScene extends Phaser.Scene {
  private pad!: KeyPad;
  private list: MenuList | null = null;
  private sub: MenuList | null = null;
  private form: SettingsForm | null = null;
  private panel: Panel | null = null;
  private junk: Phaser.GameObjects.GameObject[] = [];
  private detail: Phaser.GameObjects.GameObject[] = [];
  private tabLabels: Label[] = [];
  private tabMark!: Phaser.GameObjects.Rectangle;
  private goldLabel!: Label;
  private note!: Label;
  private keysLabel!: Label;
  private backdrop!: Phaser.GameObjects.Rectangle;
  private g!: MenuGeo;
  private rows: string[] = [];
  private tab: Tab = 'party';
  private member = 0;
  private slot = 0;
  private shop = false;
  private closing = false;

  constructor() {
    super(SCENES.overlay);
  }

  /* ------------------------------------------------------------- startup */

  init(): void {
    this.shop = !!session.shop;
    const want = (session.tab ?? '') as Tab;
    this.tab = this.shop ? 'buy' : MENU_TABS.includes(want) ? want : 'party';
    this.member = 0;
    this.slot = 0;
    this.sub = null;
    this.junk = [];
    this.detail = [];
    this.closing = false;
  }

  create(): void {
    const state = gs(this);
    this.g = menuGeo(stage.w, stage.h);
    this.backdrop = this.add.rectangle(0, 0, stage.w, stage.h, 0x0b0f1a).setOrigin(0, 0).setAlpha(0.66);
    this.panel = new Panel(
      this,
      this.g.panel.x,
      this.g.panel.y,
      this.g.panel.w,
      this.g.panel.h,
      this.shop ? 'win_shop' : 'win_default'
    );

    makeLabel(this, mapDef(state.location).name.toUpperCase(), 24, 14, { color: C.gold });
    this.goldLabel = makeLabel(this, `${state.gold} COIN`, this.g.right, 14, { color: C.gold, align: 'right' });
    this.note = makeLabel(this, '', 24, this.g.noteY, { color: C.dim });
    this.keysLabel = makeLabel(this, '[Z] OK   [Q] TABS   [ESC] CLOSE', this.g.right, this.g.noteY, {
      color: C.dark,
      align: 'right'
    });

    this.buildTabStrip();
    this.showTab();
    onStageResize(this, () => this.relayout());

    this.pad = new KeyPad(this);
    this.events.once('shutdown', () => this.pad?.destroy());
  }

  /**
   * The frame follows the window and the open tab is rebuilt inside it. Tab,
   * member index and list cursor are restored, so resizing mid-menu does not
   * send the player back to the top of the list.
   */
  private relayout(): void {
    this.g = menuGeo(stage.w, stage.h);
    const cursor = this.list?.index ?? 0;
    this.backdrop.setSize(stage.w, stage.h);
    this.panel?.place(this.g.panel.x, this.g.panel.y, this.g.panel.w, this.g.panel.h);
    this.goldLabel.setPosition(this.g.right, 14);
    this.keysLabel.setPosition(this.g.right, this.g.noteY);
    this.note.setPosition(24, this.g.noteY);
    this.showTab();
    this.list?.setIndex(cursor);
  }

  /**
   * Note columns in the list belong to the list column: they must stop short of
   * the detail card, which moves right as the window grows. The equip popup's
   * notes are placed from `g.sub` instead — those live inside the card.
   */
  private noteX(base: number): number {
    return Math.min(base, this.g.detail.x - 14);
  }

  private tabIds(): Tab[] {
    return this.shop ? SHOP_TABS : MENU_TABS;
  }

  private buildTabStrip(): void {
    let x = 24;
    this.tabLabels = this.tabIds().map((id) => {
      const l = makeLabel(this, TAB_LABEL[id], x, 32, { color: C.dim });
      x += l.labelWidth + 20;
      return l;
    });
    this.tabMark = this.add.rectangle(24, 46, 10, 2, C.gold).setOrigin(0, 0);
  }

  private paintTabs(): void {
    const ids = this.tabIds();
    let x = 24;
    ids.forEach((id, i) => {
      const l = this.tabLabels[i];
      const active = id === this.tab;
      l.setColor(active ? C.gold : C.dim);
      if (active) this.tabMark.setPosition(x, 46).setSize(Math.max(12, l.labelWidth), 2);
      x += l.labelWidth + 20;
    });
  }

  /* ------------------------------------------------------------- content */

  private showTab(): void {
    this.clearContent();
    this.paintTabs();
    this.goldLabel.setText(`${gs(this).gold} COIN`);
    switch (this.tab) {
      case 'party':
        this.buildParty();
        break;
      case 'items':
        this.buildItems();
        break;
      case 'gear':
        this.buildGear();
        break;
      case 'quests':
        this.buildQuests();
        break;
      case 'save':
        this.buildSave();
        break;
      case 'settings':
        this.buildSettings();
        break;
      case 'buy':
        this.buildBuy();
        break;
      case 'sell':
        this.buildSell();
        break;
    }
  }

  private clearContent(): void {
    this.list?.destroy();
    this.list = null;
    this.sub?.destroy();
    this.sub = null;
    this.form?.destroy();
    this.form = null;
    this.panel?.setVisible(true);
    for (const o of this.detail) o.destroy();
    this.detail = [];
    for (const o of this.junk) o.destroy();
    this.junk = [];
    this.rows = [];
  }

  private say(text: string): void {
    this.note.setText(text);
  }

  /* --------------------------------------------------------------- party */

  private buildParty(): void {
    const state = gs(this);
    const party = state.active;
    this.member = Phaser.Math.Clamp(this.member, 0, Math.max(0, party.length - 1));
    this.list = new MenuList({
      scene: this,
      x: this.g.list.x,
      y: this.g.list.y,
      rowH: 20,
      icon: true,
      noteX: this.noteX(150),
      onChange: (i) => {
        this.member = i;
        this.paintPartyDetail();
      },
      onConfirm: () => this.say(`${party[this.member]?.name.toUpperCase() ?? ''} IS READY`)
    });
    this.list.setItems(
      party.map((m) => ({
        label: m.name,
        note: `LV${m.level}`,
        icon: 'heart',
        color: m.hp > 0 ? undefined : C.hpLow
      }))
    );
    this.list.setIndex(this.member);
    this.junk.push(new Panel(this, this.g.detail.x, this.g.detail.y, this.g.detail.w, this.g.detail.h));
    this.paintPartyDetail();
    this.say('[UP/DOWN] LOOK AT THE PARTY');
  }

  private paintPartyDetail(): void {
    const state = gs(this);
    const m = state.active[this.member];
    for (const o of this.detail) o.destroy();
    this.detail = [];
    if (!m) return;

    const x = this.g.ink;
    const maxHp = state.memberMaxHp(m);
    const maxMp = state.memberMaxMp(m);
    this.detail.push(makeLabel(this, m.name.toUpperCase(), x, 66, { color: C.gold }));
    this.detail.push(makeLabel(this, `LEVEL ${m.level}`, x + 190, 66, { color: C.dim, align: 'right' }));

    this.detail.push(makeLabel(this, 'HP', x, 86, { color: C.dim }));
    this.detail.push(new Gauge(this, x + 24, 87, 120, 8, 'hp').set(maxHp > 0 ? m.hp / maxHp : 0));
    this.detail.push(makeLabel(this, `${m.hp}/${maxHp}`, x + 152, 86, { color: C.text }));

    this.detail.push(makeLabel(this, 'MP', x, 102, { color: C.dim }));
    this.detail.push(new Gauge(this, x + 24, 103, 120, 8, 'mp').set(maxMp > 0 ? m.mp / maxMp : 0));
    this.detail.push(makeLabel(this, `${m.mp}/${maxMp}`, x + 152, 102, { color: C.text }));

    const need = xpToNextLabel(m);
    this.detail.push(makeLabel(this, 'XP', x, 118, { color: C.dim }));
    this.detail.push(new Gauge(this, x + 24, 119, 120, 8, 'xp').set(need.next > 0 ? need.xp / need.next : 1));
    this.detail.push(makeLabel(this, need.text, x + 152, 118, { color: C.dim }));

    const live = gearStats(partyUnit(state, m, 0));
    STAT_KEYS.forEach((key, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      this.detail.push(
        makeLabel(this, `${STAT_LABEL[key]} ${live[key]}`, x + col * 74, 140 + row * 14, { color: C.text })
      );
    });

    this.detail.push(makeLabel(this, 'SKILLS', x, 176, { color: C.gold }));
    m.skills.forEach((id, i) => {
      const def = SKILLS[id];
      if (!def) return;
      const y = 192 + i * 14;
      this.detail.push(icon(this, def.icon, x, y));
      this.detail.push(makeLabel(this, def.name, x + 20, y, { color: C.text }));
      this.detail.push(makeLabel(this, `${def.mp} MP`, x + 190, y, { color: C.dim, align: 'right' }));
    });
  }

  /* --------------------------------------------------------------- items */

  private buildItems(): void {
    const state = gs(this);
    const inv = state.listInventory();
    this.rows = inv.map((r) => r.id);
    this.list = new MenuList({
      scene: this,
      x: this.g.list.x,
      y: this.g.list.y,
      rowH: 16,
      icon: true,
      noteX: this.noteX(300),
      onChange: (i) => this.say(ITEMS[this.rows[i]]?.desc ?? ''),
      onConfirm: (i) => this.useItem(this.rows[i])
    });
    this.list.setItems(
      inv.map((r) => {
        const def = ITEMS[r.id];
        return { label: def?.name ?? r.id, note: `x${r.count}`, icon: def?.icon };
      })
    );
    this.junk.push(new Panel(this, this.g.detail.x, this.g.detail.y, this.g.detail.w, this.g.detail.h));
    this.say(`USING GOES TO ${state.active[this.member]?.name.toUpperCase() ?? 'NO ONE'}`);
  }

  private useItem(id: string): void {
    const state = gs(this);
    const def = ITEMS[id];
    if (!def) return;
    if (def.equip) {
      this.equipItem(id);
      return;
    }
    if (def.usable === 'battle' || def.effect?.buff || def.effect?.element) {
      sfx('error');
      this.say('ONLY IN BATTLE');
      return;
    }
    if (def.kind === 'key' || def.usable === 'none') {
      sfx('error');
      this.say('NOTHING HAPPENS');
      return;
    }
    const target = state.active[this.member];
    if (!target) return;
    const eff = def.effect ?? {};
    const maxHp = state.memberMaxHp(target);
    const maxMp = state.memberMaxMp(target);

    if (eff.revive) {
      if (target.hp > 0) {
        sfx('error');
        this.say('THEY ARE ALREADY STANDING');
        return;
      }
      target.hp = Math.max(1, Math.round(maxHp * eff.revive));
    } else if (target.hp <= 0) {
      sfx('error');
      this.say('THEY CANNOT ANSWER');
      return;
    }

    let used = !!eff.revive;
    if (eff.hp && target.hp < maxHp) {
      target.hp = Math.min(maxHp, target.hp + eff.hp);
      used = true;
    }
    if (eff.mp && target.mp < maxMp) {
      target.mp = Math.min(maxMp, target.mp + eff.mp);
      used = true;
    }
    if (!used) {
      sfx('error');
      this.say('NOT NEEDED NOW');
      return;
    }

    state.removeItem(id);
    sfx('heal');
    this.say(`${target.name.toUpperCase()} USES ${def.name.toUpperCase()}`);
    bus.emit('party:changed', undefined);
    this.showTab();
  }

  private equipItem(id: string): void {
    const state = gs(this);
    const m = state.active[this.member];
    if (!m) return;
    if (!state.canEquip(m.id, id)) {
      sfx('error');
      this.say(`${m.name.toUpperCase()} CANNOT WEAR THAT`);
      return;
    }
    state.equip(m.id, id);
    sfx('confirm');
    this.say(`${m.name.toUpperCase()} EQUIPS ${ITEMS[id]?.name.toUpperCase() ?? ''}`);
    bus.emit('party:changed', undefined);
    this.showTab();
  }

  /* ---------------------------------------------------------------- gear */

  private buildGear(): void {
    const state = gs(this);
    const party = state.active;
    this.member = Phaser.Math.Clamp(this.member, 0, Math.max(0, party.length - 1));
    this.slot = Phaser.Math.Clamp(this.slot, 0, EQUIP_SLOTS.length - 1);

    party.forEach((m, i) => {
      this.junk.push(
        makeLabel(this, m.name.toUpperCase(), 44, 62 + i * 16, {
          color: i === this.member ? C.gold : C.dim
        })
      );
    });

    const m = party[this.member];
    const top = 62 + party.length * 16 + 12;
    EQUIP_SLOTS.forEach((slot, i) => {
      const id = m?.equipment[slot] ?? null;
      const def = id ? ITEMS[id] : undefined;
      const y = top + i * 20;
      this.junk.push(makeLabel(this, SLOT_LABEL[slot], 44, y, { color: i === this.slot ? 0xffffff : C.dim }));
      if (def) this.junk.push(icon(this, def.icon, 130, y));
      this.junk.push(makeLabel(this, def?.name ?? '- EMPTY -', 152, y, { color: def ? C.text : C.dark }));
    });

    this.junk.push(new Panel(this, this.g.detail.x, this.g.detail.y, this.g.detail.w, this.g.detail.h));
    this.paintGearDetail();
    this.say('[UP/DOWN] PERSON   [LEFT/RIGHT] SLOT   [Z] CHANGE   [Q] TABS');
  }

  private paintGearDetail(): void {
    const state = gs(this);
    const m = state.active[this.member];
    if (!m) return;
    const x = this.g.ink;
    this.detail.push(makeLabel(this, `${m.name.toUpperCase()} - GEAR`, x, 66, { color: C.gold }));
    const live = gearStats(partyUnit(state, m, 0));
    STAT_KEYS.forEach((key, i) => {
      this.detail.push(
        makeLabel(this, `${STAT_LABEL[key]} ${live[key]}`, x + (i % 3) * 74, 88 + Math.floor(i / 3) * 14, {
          color: C.text
        })
      );
    });
    const maxHp = state.memberMaxHp(m);
    const maxMp = state.memberMaxMp(m);
    this.detail.push(makeLabel(this, `HP ${m.hp}/${maxHp}   MP ${m.mp}/${maxMp}`, x, 124, { color: C.dim }));

    const slot = EQUIP_SLOTS[this.slot];
    const worn = ITEMS[m.equipment[slot] ?? ''];
    this.detail.push(makeLabel(this, SLOT_LABEL[slot], x, 148, { color: C.gold }));
    const lines = wrap(worn?.desc ?? 'NOTHING WORN HERE.', 330);
    lines.slice(0, 4).forEach((line, i) => {
      this.detail.push(makeLabel(this, line, x, 164 + i * 12, { color: C.dim }));
    });
    if (worn) {
      const mods = Object.entries(worn.equip?.mods ?? {}) as [StatKey, number][];
      const text = mods.map(([k, v]) => `${STAT_LABEL[k]} ${v > 0 ? '+' : ''}${v}`).join('  ');
      this.detail.push(makeLabel(this, text, x, 214, { color: C.ok }));
    }
  }

  private openEquipSub(): void {
    const state = gs(this);
    const m = state.active[this.member];
    if (!m) return;
    const slot = EQUIP_SLOTS[this.slot];
    const rows: (string | null)[] = [];
    if (m.equipment[slot]) rows.push(null);
    for (const r of state.listInventory()) {
      const def = ITEMS[r.id];
      if (def?.equip?.slot === slot && state.canEquip(m.id, r.id)) rows.push(r.id);
    }
    if (!rows.length) {
      sfx('error');
      this.say('NOTHING FITS THAT SLOT');
      return;
    }
    this.sub?.destroy();
    this.sub = new MenuList({
      scene: this,
      x: this.g.sub.x,
      y: this.g.list.y,
      rowH: 16,
      icon: true,
      noteX: this.g.sub.x + 170,
      onConfirm: (i) => this.applyEquip(m.id, slot, rows[i])
    });
    this.sub.setItems(
      rows.map((id) =>
        id === null
          ? { label: 'REMOVE', icon: 'cross' }
          : { label: ITEMS[id].name, note: `x${state.itemCount(id)}`, icon: ITEMS[id].icon }
      )
    );
    this.say('[Z] WEAR IT   [X] BACK');
  }

  private applyEquip(memberId: string, slot: EquipSlot, itemId: string | null): void {
    const state = gs(this);
    if (itemId === null) state.unequip(memberId, slot);
    else state.equip(memberId, itemId);
    sfx('confirm');
    bus.emit('party:changed', undefined);
    this.showTab();
  }

  /* -------------------------------------------------------------- quests */

  private buildQuests(): void {
    const state = gs(this);
    const all = Object.values(state.quests);
    this.rows = all.map((q) => q.id);
    this.list = new MenuList({
      scene: this,
      x: this.g.list.x,
      y: this.g.list.y,
      rowH: 20,
      icon: true,
      noteX: this.noteX(220),
      onChange: (i) => this.paintQuestDetail(this.rows[i]),
      onConfirm: (i) => this.paintQuestDetail(this.rows[i])
    });
    this.list.setItems(
      all.map((q) => ({
        label: QUESTS[q.id]?.name ?? q.id,
        note: q.done ? 'SETTLED' : `STAGE ${q.stage}`,
        icon: q.done ? 'check' : 'quest',
        color: q.done ? C.dark : undefined
      }))
    );
    this.junk.push(new Panel(this, this.g.detail.x, this.g.detail.y, this.g.detail.w, this.g.detail.h));
    if (all.length) this.paintQuestDetail(all[0].id);
    else this.say('NO LEADS YET');
  }

  private paintQuestDetail(id: string): void {
    const state = gs(this);
    const def = QUESTS[id];
    const q = state.quest(id);
    if (!def || !q) return;
    const x = this.g.ink;
    this.detail.forEach((o) => o.destroy());
    this.detail = [];
    this.detail.push(makeLabel(this, def.name.toUpperCase(), x, 66, { color: C.gold }));
    let y = 86;
    for (const line of wrap(def.summary, 330)) {
      this.detail.push(makeLabel(this, line, x, y, { color: C.dim }));
      y += 12;
    }
    y += 8;
    def.stages.forEach((s) => {
      const current = s.stage === q.stage && !q.done;
      const reached = s.stage < q.stage || q.done;
      this.detail.push(
        makeLabel(this, `${reached ? '>' : current ? '*' : ' '} ${s.text}`, x, y, {
          color: current ? C.text : reached ? C.dim : C.dark
        })
      );
      y += 12;
    });
    if (q.done) this.detail.push(makeLabel(this, 'SETTLED', x, y, { color: C.ok }));
    this.say(questText(id, q.stage));
  }

  /* ---------------------------------------------------------------- save */

  private buildSave(): void {
    this.list = new MenuList({
      scene: this,
      x: this.g.list.x,
      y: this.g.list.y,
      rowH: 22,
      icon: true,
      noteX: this.noteX(170),
      onConfirm: (i) => this.writeSave(i)
    });
    this.list.setItems(
      saves.list().map((meta, i) => ({
        label: `SLOT ${i}`,
        note: meta
          ? `${meta.location.toUpperCase()}  LV${Math.max(...meta.levels)}  ${SaveManager.formatTime(meta.playtime)}`
          : 'EMPTY',
        icon: 'save',
        color: meta ? undefined : C.dark
      }))
    );
    this.junk.push(new Panel(this, this.g.detail.x, this.g.detail.y, this.g.detail.w, this.g.detail.h));
    this.say('[Z] WRITE THE TALES SO FAR');
  }

  private writeSave(slot: number): void {
    if (saves.save(slot, gs(this))) {
      sfx('save');
      bus.emit('save:written', slot);
      this.say(`WRITTEN TO SLOT ${slot}`);
      this.showTab();
    } else {
      sfx('error');
      this.say('NO ROOM TO WRITE');
    }
  }

  /* ------------------------------------------------------------ settings */

  private buildSettings(): void {
    this.form = new SettingsForm(this, this.g.formX, 70);
    this.say('[LEFT/RIGHT] CHANGE   [UP/DOWN] ROW   [Q] TABS');
  }

  /* ---------------------------------------------------------------- shop */

  private buildBuy(): void {
    const state = gs(this);
    const stock = SHOP_STOCK[session.shop?.stock ?? ''] ?? [];
    this.rows = stock.slice();
    this.list = new MenuList({
      scene: this,
      x: this.g.list.x,
      y: this.g.list.y,
      rowH: 16,
      icon: true,
      noteX: this.noteX(300),
      onChange: (i) => this.say(ITEMS[this.rows[i]]?.desc ?? ''),
      onConfirm: (i) => this.buy(this.rows[i])
    });
    this.list.setItems(
      stock.map((id) => {
        const def = ITEMS[id];
        return {
          label: def?.name ?? id,
          note: `${def?.price ?? 0} COIN`,
          icon: def?.icon,
          enabled: (def?.price ?? 0) <= state.gold
        };
      })
    );
    this.junk.push(new Panel(this, this.g.detail.x, this.g.detail.y, this.g.detail.w, this.g.detail.h));
    this.say('[Z] BUY ONE');
  }

  private buy(id: string): void {
    const state = gs(this);
    if (!state.buy(id)) {
      sfx('error');
      this.say('NOT ENOUGH COIN');
      return;
    }
    sfx('confirm');
    bus.emit('gold:changed', state.gold);
    bus.emit('item:changed', undefined);
    this.say(`BOUGHT ${ITEMS[id]?.name.toUpperCase() ?? ''}`);
    this.showTab();
  }

  private buildSell(): void {
    const state = gs(this);
    const rows = state
      .listInventory()
      .filter((r) => (ITEMS[r.id]?.price ?? 0) > 0 && !ITEMS[r.id]?.unique);
    this.rows = rows.map((r) => r.id);
    this.list = new MenuList({
      scene: this,
      x: this.g.list.x,
      y: this.g.list.y,
      rowH: 16,
      icon: true,
      noteX: this.noteX(300),
      onChange: (i) => this.say(ITEMS[this.rows[i]]?.desc ?? ''),
      onConfirm: (i) => this.sell(this.rows[i])
    });
    this.list.setItems(
      rows.map((r) => {
        const def = ITEMS[r.id];
        return {
          label: def?.name ?? r.id,
          note: `${Math.floor((def?.price ?? 0) * BALANCE.sellRatio)} COIN  x${r.count}`,
          icon: def?.icon
        };
      })
    );
    this.junk.push(new Panel(this, this.g.detail.x, this.g.detail.y, this.g.detail.w, this.g.detail.h));
    this.say('[Z] SELL ONE');
  }

  private sell(id: string): void {
    if (!gs(this).sell(id)) {
      sfx('error');
      this.say('CANNOT SELL THAT');
      return;
    }
    sfx('confirm');
    this.say(`SOLD ${ITEMS[id]?.name.toUpperCase() ?? ''}`);
    this.showTab();
  }

  /* ---------------------------------------------------------------- input */

  override update(): void {
    for (let key = this.pad.next(); key; key = this.pad.next()) this.handle(key);
  }

  private handle(key: KeyName): void {
    if (this.closing) return;

    // A popup list (equipment candidates) owns the keys while it is open.
    if (this.sub) {
      if (key === 'UP') this.sub.move(-1);
      else if (key === 'DOWN') this.sub.move(1);
      else if (key === 'CONFIRM') this.sub.confirm();
      else if (key === 'CANCEL' || key === 'MENU') {
        this.sub.destroy();
        this.sub = null;
        sfx('cancel');
        this.say('[Z] WEAR IT   [X] BACK');
      }
      return;
    }

    if (key === 'CANCEL' || key === 'MENU') {
      this.close();
      return;
    }

    if (this.tab === 'settings') {
      // The form owns the arrows, but the tab strip has to stay reachable or
      // SETTINGS is a dead end — the only way out used to be Esc/X, which shuts
      // the whole menu rather than moving to the next tab.
      if (key === 'UP' || key === 'DOWN' || key === 'LEFT' || key === 'RIGHT') this.form?.key(key);
      else if (key === 'SPECIAL') this.cycleTab(1);
      return;
    }

    if (key === 'SPECIAL') {
      this.cycleTab(1);
      return;
    }

    if (this.tab === 'gear') {
      if (key === 'UP') this.moveMember(-1);
      else if (key === 'DOWN') this.moveMember(1);
      else if (key === 'LEFT') this.moveSlot(-1);
      else if (key === 'RIGHT') this.moveSlot(1);
      else if (key === 'CONFIRM') this.openEquipSub();
      return;
    }

    if (key === 'LEFT') this.cycleTab(-1);
    else if (key === 'RIGHT') this.cycleTab(1);
    else if (key === 'UP') this.list?.move(-1);
    else if (key === 'DOWN') this.list?.move(1);
    else if (key === 'CONFIRM') this.list?.confirm();
  }

  private cycleTab(dir: number): void {
    const ids = this.tabIds();
    const i = ids.indexOf(this.tab);
    this.tab = ids[(i + dir + ids.length) % ids.length];
    sfx('cursor');
    this.showTab();
  }

  private moveMember(dir: number): void {
    const count = gs(this).active.length;
    if (!count) return;
    this.member = (this.member + dir + count) % count;
    sfx('cursor');
    this.showTab();
  }

  private moveSlot(dir: number): void {
    // GEAR is the only tab that claims LEFT/RIGHT for itself, so rolling off
    // either end steps onto the neighbouring tab instead of wrapping the slot
    // index. Wrapping here used to trap the player on GEAR: the arrow keys
    // cycled the slots forever and the tab strip never moved past it.
    const next = this.slot + dir;
    if (next < 0 || next >= EQUIP_SLOTS.length) {
      this.cycleTab(dir);
      return;
    }
    this.slot = next;
    sfx('cursor');
    this.showTab();
  }

  private close(): void {
    if (this.closing) return;
    this.closing = true;
    const tab = String(this.tab);
    session.shop = null;
    session.tab = null;
    this.pad.clear();
    bus.emit('overlay:close', { tab });
    this.scene.stop();
  }
}

/* -------------------------------------------------------------------- util */

/** XP progress toward the next level, for the party panel's gauge. */
function xpToNextLabel(m: PartyMember): { xp: number; next: number; text: string } {
  const next = m.level >= MAX_LEVEL ? 0 : xpToNext(m.level);
  return { xp: m.xp, next, text: next > 0 ? `${m.xp}/${next}` : 'MAX LEVEL' };
}
