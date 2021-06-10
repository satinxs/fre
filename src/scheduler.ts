import { IFiber, ITask, ITaskCallback } from "./type"
import { config } from "./reconciler"

const queue: ITask[] = []
const threshold: number = 1000 / 60
let deadline: number = 0
// for transtion queue
let frame = 0
let lightQueue = []
let deferQueue = []

const consume = function (queue, timeout) {
  let i = 0,
    ts = 0
  while (i < queue.length && (ts = performance.now()) < timeout) {
    queue[i++]()
  }
  if (i === queue.length) {
    queue.length = 0
  } else if (i !== 0) {
    queue.splice(0, i)
  }
}

const transit = function () {
  const timeout = performance.now() + (1 << 4) * (frame++ >> 3)
  consume(lightQueue, timeout)
  consume(deferQueue, timeout)
  if (lightQueue.length > 0) {
    deferQueue.push(...lightQueue)
    lightQueue.length = 0
  }
  if (lightQueue.length + deferQueue.length > 0) {
    postMessage()
  } else {
    frame = 0
  }
}

export const startTransition = (cb) =>
  lightQueue.push(cb) === 1 && postMessage()

export const scheduleWork = (callback: ITaskCallback): void => {
  const job = { callback }
  queue.push(job as any)
  startTransition(flushWork)
}

const postMessage = (() => {
  if (typeof MessageChannel !== "undefined") {
    const { port1, port2 } = new MessageChannel()
    port1.onmessage = transit
    return () => port2.postMessage(null)
  }
  return () => setTimeout(transit)
})()

const flushWork = (): void => {
  deadline = getTime() + threshold
  let job = peek(queue)
  while (job && !shouldYield()) {
    const { callback } = job as any
    job.callback = null
    const next = callback()
    if (next) {
      job.callback = next as any
    } else {
      queue.shift()
    }
    job = peek(queue)
  }
  job && startTransition(flushWork)
}

export const shouldYield = (): boolean => {
  if (config && config.sync) return false
  return (
    (navigator as any)?.scheduling?.isInputPending() || getTime() >= deadline
  )
}

export const getTime = () => performance.now()

const peek = (queue: ITask[]) => queue[0]
