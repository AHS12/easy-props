export namespace backend {
	
	export class BackupSummary {
	    props: number;
	    bytes: number;
	
	    static createFrom(source: any = {}) {
	        return new BackupSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.props = source["props"];
	        this.bytes = source["bytes"];
	    }
	}
	export class CloudKeysInfo {
	    saved: boolean;
	    accessKey: string;
	
	    static createFrom(source: any = {}) {
	        return new CloudKeysInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.saved = source["saved"];
	        this.accessKey = source["accessKey"];
	    }
	}
	export class CloudSummary {
	    props: number;
	    uploaded: number;
	    changedElsewhere: number;
	    removed: number;
	
	    static createFrom(source: any = {}) {
	        return new CloudSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.props = source["props"];
	        this.uploaded = source["uploaded"];
	        this.changedElsewhere = source["changedElsewhere"];
	        this.removed = source["removed"];
	    }
	}
	export class CloudTarget {
	    service: string;
	    endpoint: string;
	    region: string;
	    bucket: string;
	    folder: string;
	    pathStyle: boolean;
	
	    static createFrom(source: any = {}) {
	        return new CloudTarget(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.service = source["service"];
	        this.endpoint = source["endpoint"];
	        this.region = source["region"];
	        this.bucket = source["bucket"];
	        this.folder = source["folder"];
	        this.pathStyle = source["pathStyle"];
	    }
	}
	export class ExportFile {
	    name: string;
	    contents: number[];
	
	    static createFrom(source: any = {}) {
	        return new ExportFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.contents = source["contents"];
	    }
	}
	export class HeldProp {
	    id: string;
	    savedAt: string;
	    size: number;
	    hasPicture: boolean;
	    status: string;
	
	    static createFrom(source: any = {}) {
	        return new HeldProp(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.savedAt = source["savedAt"];
	        this.size = source["size"];
	        this.hasPicture = source["hasPicture"];
	        this.status = source["status"];
	    }
	}
	export class HeldBackup {
	    app: string;
	    madeAt: string;
	    props: HeldProp[];
	    palettes: string;
	
	    static createFrom(source: any = {}) {
	        return new HeldBackup(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.app = source["app"];
	        this.madeAt = source["madeAt"];
	        this.props = this.convertValues(source["props"], HeldProp);
	        this.palettes = source["palettes"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class LibraryInfo {
	    folder: string;
	    props: number;
	    bytes: number;
	
	    static createFrom(source: any = {}) {
	        return new LibraryInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.folder = source["folder"];
	        this.props = source["props"];
	        this.bytes = source["bytes"];
	    }
	}
	export class PropFile {
	    id: string;
	    savedAt: string;
	    size: number;
	    hasPicture: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PropFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.savedAt = source["savedAt"];
	        this.size = source["size"];
	        this.hasPicture = source["hasPicture"];
	    }
	}
	export class RemovedProp {
	    id: string;
	    savedAt: string;
	    removedAt: string;
	    size: number;
	    hasPicture: boolean;
	
	    static createFrom(source: any = {}) {
	        return new RemovedProp(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.savedAt = source["savedAt"];
	        this.removedAt = source["removedAt"];
	        this.size = source["size"];
	        this.hasPicture = source["hasPicture"];
	    }
	}
	export class RestoreChoice {
	    id: string;
	    copyId: string;
	    copyContents: string;
	
	    static createFrom(source: any = {}) {
	        return new RestoreChoice(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.copyId = source["copyId"];
	        this.copyContents = source["copyContents"];
	    }
	}
	export class UpdateInfo {
	    available: boolean;
	    version: string;
	    releaseUrl: string;
	    canInstall: boolean;
	
	    static createFrom(source: any = {}) {
	        return new UpdateInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.available = source["available"];
	        this.version = source["version"];
	        this.releaseUrl = source["releaseUrl"];
	        this.canInstall = source["canInstall"];
	    }
	}

}

