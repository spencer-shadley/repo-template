export function handleWithErr(res) {
  try {
    throw new Error('boom');
  } catch (err) {
    res.send(err.stack);
  }
}

export function handleWithE(res) {
  try {
    throw new Error('boom');
  } catch (e) {
    res.json(e.stack);
  }
}
