/** The 3D viewer chunk (three.js + React Three Fiber) is only downloaded on product pages. */
export const loadViewer = () => import('../viewer/ProductViewer')

export const loadSnapshotPage = () => import('../pages/SnapshotPage')
