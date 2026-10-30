export namespace backend {
	
	export class TreeFile {
	    id: string;
	    savedAt: string;
	    size: number;
	
	    static createFrom(source: any = {}) {
	        return new TreeFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.savedAt = source["savedAt"];
	        this.size = source["size"];
	    }
	}

}

