// Libs
import { Deferred } from 'ts-deferred'

/* ****************************************************
  Promise Reducer
*/

type GenericPromiseReducerFunc<T, R> = (o: T) => Promise<R>

export const genericPromiseReducer = function <T, R>(
  items: T[],
  pFunc: GenericPromiseReducerFunc<T, R>
) {
  const defer = new Deferred<R[]>()

  items
    .reduce((prevPromise, item) => {
      return prevPromise.then((chainResults) => {
        return pFunc(item).then((itemResult) => [...chainResults, itemResult])
      })
    }, Promise.resolve([] as R[]))
    .then((res) => defer.resolve(res))
    .catch((err) => defer.reject(err))

  return defer.promise
}

export const AsyncRandomDelay = function (high = 100, low = 25) {
  const rdm = Math.random()
  const value = low + Math.ceil(high * rdm)

  return function <T>(o: T): Promise<T> {
    const defer = new Deferred<T>()

    setTimeout(function () {
      defer.resolve(o)
    }, value)

    return defer.promise
  }
}

export const AsyncRandomStartDelay = function (high = 100, low = 25) {
  const rdm = Math.random()
  const value = low + Math.ceil(high * rdm)

  const defer = new Deferred<string>()

  setTimeout(function () {
    defer.resolve('OK')
  }, value)

  return defer.promise
}
