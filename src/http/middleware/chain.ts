import { Request, Response, NextFunction } from "express";

/**
 * Chain of Responsibility base class.
 * Each handler either processes the request or delegates to the next.
 * Ref: refactoring.guru (concept; our implementation is minimal & idiomatic for Express).
 */
export abstract class Handler {
  private next?: Handler;
  setNext(next: Handler) { this.next = next; return next; }
  handle(req: Request, res: Response, nextFn: NextFunction) {
    if (this.next) return this.next.handle(req, res, nextFn);
    return nextFn();
  }
}
