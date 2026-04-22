import { io, type Socket } from 'socket.io-client';
import type { JobProgressEvent, JobDoneEvent, JobErrorEvent } from '@codevisualizer/types';
import { useRepoStore } from '../store/repo-store.js';

class SocketService {
  private socket: Socket | null = null;

  connect() {
    if (this.socket?.connected) return;
    this.socket = io('/', { withCredentials: true });

    this.socket.on('job:progress', (data: JobProgressEvent) => {
      useRepoStore.getState().setImportJob(data);
    });

    this.socket.on('job:done', (data: JobDoneEvent) => {
      useRepoStore.getState().onImportDone(data.repoId);
    });

    this.socket.on('job:error', (data: JobErrorEvent) => {
      useRepoStore.getState().onImportError(data.message);
    });
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }
}

export const socketService = new SocketService();
