import { proxy } from "./core";

export class TODOItemState {
  private _done: boolean = false;

  constructor(public id: number, public text: string) {
    return proxy(this);
  }

  public get done(): boolean {
    return this._done;
  }
  public set done(v: boolean) {
    if (this._done !== v) {
      this._done = v;
      if (v) {
        this.text = this.text + " (Done)";
      } else {
        this.text = this.text.replace(/ \(Done\)$/, "");
      }
    }
  }
}

export class TODOState {
  private id = 0;
  text = "";
  readonly items: TODOItemState[] = proxy([]);
  constructor() {
    return proxy(this);
  }
  addItem() {
    this.items.push(new TODOItemState(++this.id, this.text));
    this.text = "";
  }
  get pendingItems() {
    return this.items.filter((i) => !i.done);
  }
  get doneItems() {
    return this.items.filter((i) => i.done);
  }
}
