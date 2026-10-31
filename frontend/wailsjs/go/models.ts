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
	export class PropFile {
	    id: string;
	    savedAt: string;
	    size: number;
	
	    static createFrom(source: any = {}) {
	        return new PropFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.savedAt = source["savedAt"];
	        this.size = source["size"];
	    }
	}

}

