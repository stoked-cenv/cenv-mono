
async function chalk() {
  return (await import("chalk")).default;
}

async function main(){
  console.log((await chalk()).gray(">", 'Hello World!'));
}
main();