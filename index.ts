import { Device } from "node-hid";
const nodeHid = require('node-hid');

import { UpsDriver } from "./UpsDriver";

const upsDevice = nodeHid.devices().find((x: Device) => x.vendorId === 0x0665);
const ups = new UpsDriver(new nodeHid.HID(upsDevice.path));

ups.getStatus();
setTimeout(()=> {
  console.log(ups.status)
}, 5000);

//
process.on('SIGINT', () => {
  ups.close();
});

