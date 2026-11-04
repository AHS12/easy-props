export namespace backend {
	
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

