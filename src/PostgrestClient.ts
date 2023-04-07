import PostgrestQueryBuilder from "./PostgrestQueryBuilder";
import PostgrestFilterBuilder from "./PostgrestFilterBuilder";
import PostgrestBuilder from "./PostgrestBuilder";
import { DEFAULT_HEADERS } from "./constants";
import { Fetch, GenericSchema } from "./types";

/**
 * PostgREST client.
 *
 * @typeParam Database - Types for the schema from the [type
 * generator](https://supabase.com/docs/reference/javascript/next/typescript-support)
 *
 * @typeParam SchemaName - Postgres schema to switch to. Must be a string
 * literal, the same one passed to the constructor. If the schema is not
 * `"public"`, this must be supplied manually.
 */
export default class PostgrestClient<
	Database = any,
	SchemaName extends string & keyof Database = "public" extends keyof Database
		? "public"
		: string & keyof Database,
	Schema extends GenericSchema = Database[SchemaName] extends GenericSchema
		? Database[SchemaName]
		: any,
> {
	url: string;
	headers: Record<string, string>;

	// TODO: Add back shouldThrowOnError once we figure out the typings
	/**
	 * Creates a PostgREST client.
	 *
	 * @param url - URL of the PostgREST endpoint
	 * @param options - Named parameters
	 * @param options.headers - Custom headers
	 */
	constructor(
		url: string,
		{
			headers = {},
		}: {
			headers?: Record<string, string>;
		} = {},
	) {
		this.url = url;
		this.headers = { ...DEFAULT_HEADERS, ...headers };
	}

	from<
		TableName extends string & keyof Schema["Tables"],
		Table extends Schema["Tables"][TableName],
	>(relation: TableName): PostgrestQueryBuilder<Schema, Table>;
	from<
		ViewName extends string & keyof Schema["Views"],
		View extends Schema["Views"][ViewName],
	>(relation: ViewName): PostgrestQueryBuilder<Schema, View>;
	from(relation: string): PostgrestQueryBuilder<Schema, any>;
	/**
	 * Perform a query on a table or a view.
	 *
	 * @param relation - The table or view name to query
	 */
	from(relation: string): PostgrestQueryBuilder<Schema, any> {
		let [schema, table] = relation.split(".");
		if (!table) {
			table = schema;
			schema = "public";
		}
		const url = new URL(`${this.url}/${table}`);
		return new PostgrestQueryBuilder<Schema, any>(url, {
			headers: { ...this.headers },
			schema,
		});
	}

	/**
	 * Perform a function call.
	 *
	 * @param fn - The function name to call
	 * @param args - The arguments to pass to the function call
	 * @param options - Named parameters
	 * @param options.head - When set to `true`, `data` will not be returned.
	 * Useful if you only need the count.
	 * @param options.count - Count algorithm to use to count rows returned by the
	 * function. Only applicable for [set-returning
	 * functions](https://www.postgresql.org/docs/current/functions-srf.html).
	 *
	 * `"exact"`: Exact but slow count algorithm. Performs a `COUNT(*)` under the
	 * hood.
	 *
	 * `"planned"`: Approximated but fast count algorithm. Uses the Postgres
	 * statistics under the hood.
	 *
	 * `"estimated"`: Uses exact count for low numbers and planned count for high
	 * numbers.
	 */
	rpc<
		FunctionName extends string & keyof Schema["Functions"],
		Function_ extends Schema["Functions"][FunctionName],
	>(
		fn: FunctionName,
		args: Function_["Args"] = {},
		{
			head = false,
			count,
		}: {
			head?: boolean;
			count?: "exact" | "planned" | "estimated";
		} = {},
	): PostgrestFilterBuilder<
		Schema,
		Function_["Returns"] extends any[]
			? Function_["Returns"][number] extends Record<string, unknown>
				? Function_["Returns"][number]
				: never
			: never,
		Function_["Returns"]
	> {
		let method: "HEAD" | "POST";
		let [schema, fnname] = fn.split(".");
		if (!fnname) {
			fnname = schema;
			schema = "public";
		}
		const url = new URL(`${this.url}/rpc/${fnname}`);
		let body: unknown | undefined;
		if (head) {
			method = "HEAD";
			Object.entries(args).forEach(([name, value]) => {
				url.searchParams.append(name, `${value}`);
			});
		} else {
			method = "POST";
			body = args;
		}

		const headers = { ...this.headers };
		if (count) {
			headers["Prefer"] = `count=${count}`;
		}

		return new PostgrestFilterBuilder({
			method,
			url,
			headers,
			schema,
			body,
			allowEmpty: false,
		} as unknown as PostgrestBuilder<Function_["Returns"]>);
	}
}
