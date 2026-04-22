import { io, Socket } from 'socket.io-client'
import type { JobProgressEvent, JobDoneEvent, JobErrorEvent } from '@cv/types'

let socket: Socket | null = null

function getSocket(): Socket {
  if (!socket) {
    socket = io(window.location.origin, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
    })
  }
  return socket
}

export interface JobSocketHandlers {
  onProgress: (event: JobProgressEvent) => void
  onDone: (event: JobDoneEvent) => void
  onError: (event: JobErrorEvent) => void
}

export function connectJobSocket(jobId: string, handlers: JobSocketHandlers): () => void {
  const sock = getSocket()

  const doSubscribe = () => sock.emit('subscribe', jobId)
  if (sock.connected) doSubscribe()
  sock.on('connect', doSubscribe)

  const onProgress = (event: JobProgressEvent) => {
    if (event.jobId === jobId) handlers.onProgress(event)
  }
  const onDone = (event: JobDoneEvent) => {
    if (event.jobId === jobId) handlers.onDone(event)
  }
  const onError = (event: JobErrorEvent) => {
    if (event.jobId === jobId) handlers.onError(event)
  }

  sock.on('job:progress', onProgress)
  sock.on('job:done', onDone)
  sock.on('job:error', onError)

  return () => {
    sock.emit('unsubscribe', jobId)
    sock.off('connect', doSubscribe)
    sock.off('job:progress', onProgress)
    sock.off('job:done', onDone)
    sock.off('job:error', onError)
  }
}
