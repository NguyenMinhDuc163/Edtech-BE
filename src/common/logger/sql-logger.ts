import {Logger} from 'typeorm'

export class SimpleSqlLogger implements Logger {
    logQuery(query: string, parameters?: any[]) {
        // Bỏ qua logging cho bảng api_logs để tránh spam
        if (query.toLowerCase().includes('api_logs')) {
            return
        }

        // Format SQL query đẹp hơn
        const formattedQuery = this.formatQuery(query)
        console.log('🔍 SQL Query:')
        console.log(formattedQuery)

        if (parameters && parameters.length > 0) {
            console.log('📝 Parameters:', parameters)
        }
        console.log('─'.repeat(50))
    }

    logQueryError(error: string, query: string, parameters?: any[]) {
        // Bỏ qua logging cho bảng api_logs để tránh spam
        if (query.toLowerCase().includes('api_logs')) {
            return
        }

        console.error('❌ SQL Error:', error)
        console.log('🔍 Query:', this.formatQuery(query))
        if (parameters && parameters.length > 0) {
            console.log('📝 Parameters:', parameters)
        }
    }

    logQuerySlow(time: number, query: string, parameters?: any[]) {
        // Bỏ qua logging cho bảng api_logs để tránh spam
        if (query.toLowerCase().includes('api_logs')) {
            return
        }

        console.warn(`⏱️  Slow Query (${time}ms):`)
        console.log(this.formatQuery(query))
        if (parameters && parameters.length > 0) {
            console.log('📝 Parameters:', parameters)
        }
    }

    logSchemaBuild(message: string) {
        // Không log schema build để giảm noise
    }

    logMigration(message: string) {
        // Không log migration để giảm noise
    }

    log(level: 'log' | 'info' | 'warn', message: any) {
        // Không log general messages
    }

    private formatQuery(query: string): string {
        // Loại bỏ các alias dài và format lại
        let formatted = query
            .replace(/"User__User_roles__User__User_roles_role"/g, '"Role"')
            .replace(/"User__User_roles"/g, '"UserRole"')
            .replace(/"User"/g, '"User"')
            .replace(/AS "User_[^"]*"/g, '')
            .replace(/AS "UserRole_[^"]*"/g, '')
            .replace(/AS "Role_[^"]*"/g, '')

        // Thêm line breaks cho dễ đọc
        formatted = formatted
            .replace(/SELECT/g, '\nSELECT')
            .replace(/FROM/g, '\nFROM')
            .replace(/LEFT JOIN/g, '\nLEFT JOIN')
            .replace(/WHERE/g, '\nWHERE')
            .replace(/ORDER BY/g, '\nORDER BY')
            .replace(/LIMIT/g, '\nLIMIT')

        return formatted.trim()
    }
}
