import fs from 'fs';
import path from 'path';

export interface EtlState {
  stage: 'INIT' | 'SYSTEM' | 'ARGENFOODS' | 'SARA2' | 'TBCA' | 'USDA' | 'OPENFOODFACTS' | 'RESOLVER' | 'EXPORT' | 'DONE';
  processedLines: Record<string, number>;
  bytesRead: Record<string, number>;
}

export class StateTracker {
  private stateFilePath: string;
  private state: EtlState;

  constructor(stateDir: string) {
    this.stateFilePath = path.join(stateDir, '.etl-state.json');
    this.state = this.loadState();
  }

  private loadState(): EtlState {
    if (fs.existsSync(this.stateFilePath)) {
      try {
        const raw = fs.readFileSync(this.stateFilePath, 'utf-8');
        return JSON.parse(raw);
      } catch (err) {
        console.warn('[StateTracker] Failed to parse state file, starting fresh.');
      }
    }
    return this.getInitialState();
  }

  private getInitialState(): EtlState {
    return {
      stage: 'INIT',
      processedLines: {},
      bytesRead: {},
    };
  }

  public getState(): EtlState {
    return this.state;
  }

  public updateStage(stage: EtlState['stage']) {
    this.state.stage = stage;
    this.saveState();
  }

  public updateMetrics(source: string, metrics: { lines?: number; bytes?: number }) {
    if (metrics.lines !== undefined) {
      this.state.processedLines[source] = metrics.lines;
    }
    if (metrics.bytes !== undefined) {
      this.state.bytesRead[source] = metrics.bytes;
    }
    this.saveState();
  }

  public saveState() {
    fs.writeFileSync(this.stateFilePath, JSON.stringify(this.state, null, 2), 'utf-8');
  }

  public reset() {
    this.state = this.getInitialState();
    if (fs.existsSync(this.stateFilePath)) {
      fs.unlinkSync(this.stateFilePath);
    }
  }
}
