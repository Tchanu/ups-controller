import { HID } from "node-hid";

// protocol https://networkupstools.org/protocols/megatec.html
export class UpsDriver {
  status: UpsStatus = getUpsStatusInitial();
  rating: UpsRating = getUpsRatingInitial();

  constructor(private hid: HID) {
    hid.on('data', this.handleData.bind(this));
  }

  beeperToggle(): void {
    this.writeCmd("Q");
  }

  testBatteryQuick(): void {
    this.writeCmd("T");
  }

  getRating() {
    this.writeCmd('F');
  }

  getStatus() {
    this.writeCmd('QS');
  }

  /**
   *
   * @param n - shutdown time, minutes ranging form 0.2 to 10
   */
  shutdown(n: number): void {
    this.writeCmd(`S${getTimeRange(n)}`);
  }

  /**
   *
   * @param n - shutdown time, minutes ranging form 0.2 to 10
   * @param m - restore time, minutes ranging form 0.2 to 10
   */
  shutdownAndRestore(n: number, m: number): void {
    this.writeCmd(`S${getTimeRange(n)}R${getTimeRange(m)}`);
  }

  cancelShutdown(): void {
    this.writeCmd('C');
  }

  close(): void {
    this.hid.close();
  }

  accumulator: {data: string, type: DataType} | null = null;

  private writeCmd(cmd: string): void {
    if(this.accumulator) {
      // busy
    }
    this.hid.write([...Buffer.from(cmd), 0x0d]);
  }

  private handleData(buffer: Buffer) {
    switch (true) {
      case buffer[0] === 35: { // rating start
        if(this.accumulator) {
          console.error('invalid start');
        }
        this.accumulator = {
          data: buffer + '',
          type: DataType.Rating,
        }
        break;
      }
      case buffer[0] === 40: { // status start
        if(this.accumulator) {
          console.error('invalid start');
        }
        this.accumulator = {
          data: buffer + '',
          type: DataType.Status,
        }
        break;
      }
      default: {
        if(!this.accumulator) {
          console.error('invalid data');
          break;
        }
        this.accumulator = {
          ...this.accumulator,
          data: `${this.accumulator?.data}${buffer}`,
        }

        // end
        if(buffer[7] === 0) {
          switch (this.accumulator.type) {
            case DataType.Status:
              this.handleStatus(this.accumulator.data);
              break;
            case DataType.Rating:
              this.handleRating(this.accumulator.data);
              break;
          }

          this.accumulator = null;
        }
      }
    }
  }

  private handleStatus(data: string): void {
    /// (MMM.M NNN.N PPP.P QQQ RR.R SS.S TT.T b7..b0
    const parseFloat = parseFloatBuilder(data);
    const parseCurrent = parseCurrentBuilder(data);
    const statusBites = parseInt(data.substr(38, 8), 2);

    this.status = {
      IPVoltage: parseFloat(1, 5),
      IPFaultVoltage: parseFloat(7, 5),
      OPVoltage: parseFloat(13, 5),
      OPCurrent: parseCurrent(19, 3),
      IPFrequency: parseFloat(23, 4),
      batteryVoltage: parseFloat(28, 4),
      status: {
        beeperOn: !!(statusBites & 1 << 0),
        shutdownActive: !!(statusBites & 1 << 1),
        testInProgress: !!(statusBites & 1 << 2),
        standBy: !!(statusBites & 1 << 3),
        failed: !!(statusBites & 1 << 4),
        bypass: !!(statusBites & 1 << 5),
        batteryLow: !!(statusBites & 1 << 6),
        utilityFail: !!(statusBites & 1 << 7),
      }
    }
  }

  private handleRating(data: string): void {
    // #MMM.M QQQ SS.SS RR.R<cr>
    const parseFloat = parseFloatBuilder(data);
    const parseCurrent = parseCurrentBuilder(data);

    this.rating = {
      ratingVoltage: parseFloat(1, 5),
      ratingCurrent: parseCurrent(7, 3),
      batteryVoltage: parseFloat(11, 5),
      frequency: parseFloat(17, 5),
    }
    console.log(this.rating);
  }
}

export enum DataType {
  Status,
  Rating,
}

export interface UpsStatus {
  IPVoltage: number; // volt
  IPFaultVoltage: number; // volt
  OPVoltage: number; // volt
  OPCurrent: number; // percent [0,1]
  IPFrequency: number;
  batteryVoltage: number;
  status: UPSStatusEnum;
}

export interface UpsRating {
  ratingVoltage: number;
  ratingCurrent: number; // percent [0,1]
  batteryVoltage: number;
  frequency: number;
}

export interface UPSStatusEnum {
  beeperOn: boolean;
  shutdownActive: boolean;
  testInProgress: boolean;
  standBy: boolean; // 1 - standby, 0 - on line
  failed: boolean;
  bypass: boolean;
  batteryLow: boolean;
  utilityFail: boolean;
}

const getUpsStatusInitial = (): UpsStatus => ({
  IPFaultVoltage: 0,
  IPFrequency: 0,
  IPVoltage: 0,
  OPCurrent: 0,
  OPVoltage: 0,
  batteryVoltage: 0,
  status: {
    beeperOn: false,
    shutdownActive: false,
    testInProgress: false,
    standBy: false,
    failed: false,
    bypass: false,
    batteryLow: false,
    utilityFail: false,
  }
});

const getUpsRatingInitial = (): UpsRating => ({
  ratingVoltage: 0,
  ratingCurrent: 0,
  batteryVoltage: 0,
  frequency: 0,
})

const parseFloatBuilder = (data: string)=> (from: number, length: number) => Number.parseFloat(data.substr(from, length));
const parseCurrentBuilder = (data: string)=> (from: number, length: number) => Number(data.substr(from, length)) / 100
const getTimeRange = (x: number): string => {
  if(x < 0.2 || x > 10) throw new Error('invalid range');
  if(x < 1) {
    return x.toFixed(1).substr(1,2);
  }

  return x.toFixed(0);
}

function arrayBufferToString(buffer: []) {
  const str = String.fromCharCode.apply(String, [...new Uint8Array(buffer)]);
  if (/[\u0080-\uffff]/.test(str)) {
    throw new Error("this string seems to contain (still encoded) multibytes");
  }
  return str;
}
